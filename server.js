import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io'; // Using Socket.io
import multer from 'multer';
import B2 from 'backblaze-b2';
import path from 'path';
import fs from 'fs';
import { MongoClient } from 'mongodb'; // MongoDB integration
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/netrunner"; // Default MongoDB URI
const B2_APPLICATION_KEY_ID = process.env.B2_APPLICATION_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;

// --- Initialize Express App and HTTP Server ---
const app = express();
const httpServer = createServer(app);

// --- Initialize Socket.io Server ---
const io = new SocketIOServer(httpServer);

// --- Initialize Multer (memory storage for direct B2 upload) ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Initialize Backblaze B2 ---
let b2;
async function authorizeB2() {
    if (!B2_APPLICATION_KEY_ID || !B2_APPLICATION_KEY) {
        console.warn("⚠️ Backblaze B2 credentials not provided. File uploads to B2 will not work.");
        return;
    }
    b2 = new B2({
        applicationKeyId: B2_APPLICATION_KEY_ID,
        applicationKey: B2_APPLICATION_KEY
    });
    try {
        await b2.authorize();
        console.log("✅ Successfully authorized with Backblaze B2.");
    } catch (err) {
        console.error("❌ Error authorizing with Backblaze B2:", err.message);
        b2 = null; // Mark B2 as unauthorized
    }
}

// --- MongoDB Connection ---
let mongoClient;
let agentReportsCollection;
let filesCollection;

async function connectMongo() {
    if (!MONGO_URI) {
        console.warn("⚠️ MONGO_URI not provided. MongoDB logging will not work.");
        return;
    }
    try {
        mongoClient = new MongoClient(MONGO_URI);
        await mongoClient.connect();
        const db = mongoClient.db("netrunner_logs");
        agentReportsCollection = db.collection("sync_server_logs");
        filesCollection = db.collection("received_files");
        console.log("💾 MongoDB Connected.");
    } catch (e) {
        console.error("❌ MongoDB Connection Failed:", e.message);
        mongoClient = null;
    }
}

// Helper for MongoDB logging
async function logToMongo(level, message, metadata = {}) {
    if (!agentReportsCollection) return;
    try {
        await agentReportsCollection.insertOne({
            level,
            message,
            timestamp: new Date(),
            ...metadata,
        });
    } catch (e) {
        console.error("Error logging to MongoDB:", e.message);
    }
}

// --- Express Middleware ---
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const { originalname, buffer, mimetype } = req.file;
    const agentId = req.body.agentId || 'unknown_agent';
    const hostname = req.body.hostname || 'unknown_host';

    let fileDoc = {
        filename: originalname,
        size: buffer.length,
        agentId: agentId,
        hostname: hostname,
        timestamp: new Date(),
        status: 'pending',
        cloudPath: null
    };

    try {
        if (filesCollection) {
            const result = await filesCollection.insertOne(fileDoc);
            fileDoc._id = result.insertedId;
        }

        if (!b2 || !B2_BUCKET_NAME) {
            logToMongo('warn', 'Backblaze B2 not configured or authorized. Saving file metadata only.', { file: originalname, agentId });
            if (filesCollection && fileDoc._id) {
                await filesCollection.updateOne(
                    { _id: fileDoc._id },
                    { $set: { status: 'b2_unconfigured', error: 'B2 not configured or authorized' } }
                );
            }
            return res.status(500).send('Backblaze B2 not configured or authorized for uploads.');
        }

        logToMongo('info', `Attempting to upload file to B2: ${originalname}`, { file: originalname, agentId });

        const fileInfo = await b2.getUploadUrl({ bucketName: B2_BUCKET_NAME });
        const uploadUrl = fileInfo.data.uploadUrl;
        const authToken = fileInfo.data.authorizationToken;

        const b2UploadResult = await b2.uploadFile({
            uploadUrl: uploadUrl,
            uploadAuthToken: authToken,
            bucketName: B2_BUCKET_NAME,
            fileName: `${agentId}/${Date.now()}-${originalname}`,
            data: buffer,
            mime: mimetype
        });

        const cloudPath = b2UploadResult.data.fileName;
        logToMongo('info', `File uploaded successfully to B2: ${cloudPath}`, { file: originalname, agentId, cloudPath });

        if (filesCollection && fileDoc._id) {
            await filesCollection.updateOne(
                { _id: fileDoc._id },
                { $set: { status: 'persisted', cloudPath: cloudPath, persistedAt: new Date() } }
            );
        }

        res.status(200).send({ message: `File ${originalname} uploaded successfully to B2.`, cloudPath: cloudPath });

    } catch (error) {
        console.error('❌ Error during file upload to B2:', error);
        logToMongo('error', `Failed to upload file to B2: ${originalname}`, { file: originalname, agentId, error: error.message });
        if (filesCollection && fileDoc._id) {
            await filesCollection.updateOne(
                { _id: fileDoc._id },
                { $set: { status: 'failed', error: error.message } }
            );
        }
        res.status(500).send('Error uploading file to Backblaze B2.');
    }
});

// --- Socket.io Connections ---
io.on('connection', (socket) => {
    console.log('⚡ New client connected:', socket.id);
    logToMongo('info', 'Socket.io client connected', { socketId: socket.id });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
        logToMongo('info', 'Socket.io client disconnected', { socketId: socket.id });
    });

    socket.on('agent_report', async (data) => {
        console.log('Agent Report:', data);
        if (agentReportsCollection) {
            await agentReportsCollection.updateOne(
                { agentId: data.agentId },
                {
                    $set: {
                        ...data,
                        lastSeen: new Date(),
                        socketId: socket.id,
                        isOnline: true
                    },
                    $setOnInsert: {
                        firstSeen: new Date()
                    }
                },
                { upsert: true }
            );
        }
        // Emit update to connected dashboards
        io.emit('dashboard_update', { type: 'agent_status', agentId: data.agentId, status: 'online' });
    });

    socket.on('command', (commandData) => {
        console.log(`Command received for agent ${commandData.agentId}:`, commandData.command);
        // Implement logic to send commands to specific agents if needed
    });

    socket.on('file_metadata', (metadata) => {
        console.log('File Metadata from Agent:', metadata);
        // This could be used for advanced file handling via websockets if needed
        // For now, we are using HTTP POST for file uploads
    });

    // You can define other Socket.io events here for agent-server communication
});

// --- Server Start ---
async function startServer() {
    await authorizeB2();
    await connectMongo();

    httpServer.listen(PORT, () => {
        console.log(`🚀 NetRunner Server active on http://localhost:${PORT}`);
        console.log(`Socket.io listening on port ${PORT}`);
    });
}

startServer();

// Clean up on exit
process.on('beforeExit', async () => {
    if (mongoClient) {
        await mongoClient.close();
        console.log("MongoDB connection closed.");
    }
});