import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import multer from 'multer';
import B2 from 'backblaze-b2';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL;
const B2_APPLICATION_KEY_ID = process.env.B2_APPLICATION_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;
const B2_BUCKET_ID = process.env.B2_BUCKET_ID;

// --- Express + HTTP server ---
const app = express();
const httpServer = createServer(app);
const bridgeLogPath = path.join(process.cwd(), 'bridge_status.log');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, 'public');

function writeBridgeLog(level, ...args) {
    try {
        const message = args.map((arg) => {
            if (typeof arg === 'string') return arg;
            try {
                return JSON.stringify(arg);
            } catch {
                return String(arg);
            }
        }).join(' ');
        fs.appendFileSync(bridgeLogPath, `[${new Date().toISOString()}] [${level}] ${message}\n`);
    } catch {
        // Never crash process because of logging I/O.
    }
}

const originalConsoleLog = console.log.bind(console);
const originalConsoleWarn = console.warn.bind(console);
const originalConsoleError = console.error.bind(console);
console.log = (...args) => { writeBridgeLog('INFO', ...args); originalConsoleLog(...args); };
console.warn = (...args) => { writeBridgeLog('WARN', ...args); originalConsoleWarn(...args); };
console.error = (...args) => { writeBridgeLog('ERROR', ...args); originalConsoleError(...args); };

// --- Socket.io server ---
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- nodeId -> socketId mapping ---
const nodeSocketMap = {}; // Stores nodeId -> socket.id
const nodeSessionMap = {}; // Stores nodeId -> metadata for runtime classification
const latestIntegrityReports = {};
const backupSessionStore = new Map();

// --- Multer for in-memory uploads ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Backblaze B2 authorization
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
        b2 = null;
    }
}

// --- MongoDB models ---
const telemetrySchema = new mongoose.Schema({
    nodeId: { type: String, required: true, unique: false },
    hostname: String,
    ip: String,
    os: String,
    user: String,
    status: String,
    lastSeen: { type: Date, default: Date.now },
    firstSeen: { type: Date, default: Date.now },
    socketId: String,
    isOnline: Boolean,
    level: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const assetSyncSchema = new mongoose.Schema({
    filename: String,
    size: Number,
    nodeId: String,
    hostname: String,
    timestamp: { type: Date, default: Date.now },
    status: String, // e.g., 'pending', 'persisted', 'failed', 'b2_unconfigured'
    cloudPath: String,
    persistedAt: Date,
    error: String
}, { timestamps: true });

const TelemetryReport = mongoose.model('TelemetryReport', telemetrySchema);
const AssetSyncEntry = mongoose.model('AssetSyncEntry', assetSyncSchema);

async function connectMongo() {
    if (!MONGO_URL) {
        console.warn("⚠️ MONGO_URL not provided. MongoDB connection will not be established.");
        return;
    }
    try {
        await mongoose.connect(MONGO_URL);
        console.log("💾 MongoDB Connected (Mongoose).");
    } catch (e) {
        console.error("❌ MongoDB Connection Failed:", e.message);
    }
}

// Persist telemetry events in MongoDB when available.
async function logTelemetryToMongo(level, message, metadata = {}) {
    if (mongoose.connection.readyState !== 1) {
        console.warn("MongoDB not connected, skipping log entry.");
        return;
    }
    
    // Log to console regardless
    console.log(`[${level.toUpperCase()}] ${message}`, metadata);

    // Only persist telemetry records when nodeId is present
    if (!metadata.nodeId) {
        console.warn("Skipping TelemetryReport update/creation: nodeId is missing in metadata.");
        return;
    }

    try {
        // Find existing telemetry report or create a new one
        let report = await TelemetryReport.findOne({ nodeId: metadata.nodeId });

        if (report) {
            // Update existing report
            Object.assign(report, { level, message, timestamp: new Date(), ...metadata });
            await report.save();
        } else {
            // Create new report
            await TelemetryReport.create({
                level,
                message,
                timestamp: new Date(),
                ...metadata,
            });
        }
    } catch (e) {
        console.error("Error logging to MongoDB (TelemetryReport):", e.message);
    }
}

// --- Middleware ---
app.use(express.json({ limit: '12mb' }));
app.use('/public', express.static(publicPath, {
    maxAge: '5m',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        }
    }
}));
app.use(express.static(publicPath, { maxAge: '5m' }));

// --- Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/api/check-file', async (req, res) => {
    const { nodeId, filename } = req.query;
    try {
        const existing = await AssetSyncEntry.findOne({ nodeId, filename, status: 'persisted' });
        res.json({ exists: !!existing });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function normalizeNodeRuntime(value) {
    return value === 'native_workspace' ? 'native_workspace' : 'web_client';
}

function sanitizeBackupPath(pathValue = '') {
    return String(pathValue)
        .replace(/\\/g, '/')
        .replace(/^\.+/, '')
        .replace(/[^a-zA-Z0-9/_\-\.]/g, '_')
        .replace(/\/+/g, '/')
        .replace(/^\//, '');
}

async function uploadBufferToB2(buffer, fileName, mime = 'application/octet-stream') {
    const fileInfo = await b2.getUploadUrl({ bucketId: B2_BUCKET_ID });
    return b2.uploadFile({
        uploadUrl: fileInfo.data.uploadUrl,
        uploadAuthToken: fileInfo.data.authorizationToken,
        fileName,
        data: buffer,
        mime
    });
}

app.post('/api/chat', async (req, res) => {
    const { messages, model } = req.body; // 'model' from frontend determines preferred model

    let selectedApiKey, selectedApiUrl, selectedModelName;

    // --- Prioritize Groq API ---
    if (process.env.GROQ_API_KEY) {
        selectedApiKey = process.env.GROQ_API_KEY;
        selectedApiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        // Extract model name, remove 'groq:' prefix if present
        const cleanModel = model ? model.replace(/^groq:/, '') : 'llama-3.1-8b-instant';
        // Accept any valid Groq model
        const validGroqModels = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'llama3-70b-8192', 'llama3-8b-8192'];
        if (validGroqModels.includes(cleanModel)) {
            selectedModelName = cleanModel;
        } else {
            selectedModelName = 'llama-3.1-8b-instant'; // Default Groq model
        }
        console.log(`Using Groq API with model: ${selectedModelName}`);
    } 
    // --- Fallback to OpenCodeZen API ---
    else if (process.env.OPENCODE_ZEN_API_KEY) {
        selectedApiKey = process.env.OPENCODE_ZEN_API_KEY;
        selectedApiUrl = 'https://api.opencodezen.com/v1/chat/completions';
        // Placeholder for OpenCodeZen's free models. Adjust as per their documentation.
        // For example, if OpenCodeZen supports gpt-4o-mini or a llama variant:
        selectedModelName = model || 'opencodezen-free-model'; // Use frontend model or default
        console.log(`Using OpenCodeZen API with model: ${selectedModelName}`);
    } 
    // --- No AI API configured ---
    else {
        console.error('Neither GROQ_API_KEY nor OPENCODE_ZEN_API_KEY is configured.');
        return res.status(500).json({ error: 'No AI API key configured on the server.' });
    }

    if (!selectedApiKey) { // Should not happen with the logic above, but good for safety
        return res.status(500).json({ error: 'AI API key not configured.' });
    }

    try {
        const fetch = (await import('node-fetch')).default; // Dynamically import node-fetch
        const aiResponse = await fetch(selectedApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${selectedApiKey}`
            },
                body: JSON.stringify({
                model: selectedModelName, // Use the determined model name
                messages: [
                    {
                        role: 'system',
                        content: `Eres SystemBridge, un asistente de productividad familiar. Tu tono debe ser amigable, claro y servicial.

## Capacidades que puedes ofrecer al usuario:

### 📸 Organizacion de Fotos y Videos
- "Puedo organizar tus fotos y videos por fechas automaticamente en carpetas como Fotos, Videos, Musica"
- Detecto automaticamente archivos multimedia y puedo clasificarlos

### 📂 Gestion de Archivos
- Crear, renombrar, mover y eliminar archivos y carpetas
- Leer contenido de archivos de texto
- Organizacion inteligente por categorias

### 🔐 Seguridad y Respaldo
- "Puedo hacer copias de seguridad de tus documentos importantes en una bóveda segura (Backblaze B2)"
- Cifrado AES-256 para proteger tus datos
- Respaldo automatico de archivos criticos

### 🧹 Limpieza Inteligente
- "Puedo limpiar archivos basura y dejarte solo lo que necesitas"
- Elimino archivos temporales, duplicados o innecesarios
- Protejo archivos importantes automaticamente

### 📝 Lectura de Notas
- "Puedo leer tus notas y ayudarte a resumirlas o recordarlas"
- Lee archivos .txt, .md y otros formatos de texto

## Como interactuar:
Cuando el usuario pida algo, NO describas comandos. Responde confirmando la accion y el sistema la ejecutara automaticamente.

Cuando el usuario diga "ayuda" o parezca perdido, muestra las capacidades con iconos amigables.

No menciones flujos anteriores ni detalles tecnicos internos.`
                    },
                    ...messages
                ],
                temperature: 0.7 // Example parameter, can be made configurable
            })
        });

        const aiData = await aiResponse.json();

        if (!aiResponse.ok) {
            // Log the full error response from the external API for diagnosis
            console.error(`External AI API error (${selectedModelName}):`, aiResponse.status, aiData);
            return res.status(aiResponse.status).json({ 
                error: aiData.error?.message || `Error from external AI API (${selectedModelName})`,
                details: aiData // Include full details for debugging
            });
        }

        res.json({ text: aiData.choices[0]?.message?.content || '' });

    } catch (error) {
        console.error('Error proxying AI request:', error);
        res.status(500).json({ error: `Failed to communicate with AI API: ${error.message}` });
    }
});

// Asset upload endpoint.
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const { originalname, buffer, mimetype } = req.file;
    const nodeId = req.body.nodeId || 'unknown_node';
    const hostname = req.body.hostname || 'unknown_host';

    let fileDoc = {
        filename: originalname,
        size: buffer.length,
        nodeId: nodeId,
        hostname: hostname,
        timestamp: new Date(),
        status: 'pending',
        cloudPath: null
    };

    try {
        let createdAssetSyncEntry;
        try {
            createdAssetSyncEntry = await AssetSyncEntry.create(fileDoc);
            fileDoc._id = createdAssetSyncEntry._id;
        } catch (dbError) {
            console.error("❌ Error creating initial AssetSyncEntry:", dbError.message);
            // Continue execution and persist status at the end if possible.
        }

        if (!b2 || !B2_BUCKET_NAME || !B2_BUCKET_ID) {
            logTelemetryToMongo('warn', 'Backblaze B2 not configured or authorized. Saving file metadata only.', { file: originalname, nodeId });
            if (createdAssetSyncEntry) {
                await AssetSyncEntry.updateOne(
                    { _id: createdAssetSyncEntry._id },
                    { $set: { status: 'b2_unconfigured', error: 'B2 not configured or authorized' } }
                );
            }
            return res.status(500).send('Backblaze B2 not configured or authorized for uploads.');
        }

        logTelemetryToMongo('info', `Attempting to upload file to B2: ${originalname}`, { file: originalname, nodeId });

	const fileInfo = await b2.getUploadUrl({ bucketId: B2_BUCKET_ID }); 
	const uploadUrl = fileInfo.data.uploadUrl;
	const authToken = fileInfo.data.authorizationToken;

	const b2UploadResult = await b2.uploadFile({
	    uploadUrl: uploadUrl,
	    uploadAuthToken: authToken,
	    fileName: `${nodeId}/${Date.now()}-${originalname}`,
	    data: buffer,
	    mime: mimetype
});

        const cloudPath = b2UploadResult.data.fileName;
        logTelemetryToMongo('info', `File uploaded successfully to B2: ${cloudPath}`, { file: originalname, nodeId });

        if (createdAssetSyncEntry) {
            await AssetSyncEntry.updateOne(
                { _id: createdAssetSyncEntry._id },
                { $set: { status: 'persisted', cloudPath: cloudPath, persistedAt: new Date() } }
            );
        }

        res.status(200).send({ message: `File ${originalname} uploaded successfully to B2.`, cloudPath: cloudPath });

    } catch (error) {
        console.error('❌ Error during file upload to B2:', error);
        logTelemetryToMongo('error', `Failed to upload file to B2: ${originalname}`, { file: originalname, nodeId, error: error.message });
        if (fileDoc._id) {
            await AssetSyncEntry.updateOne(
                { _id: fileDoc._id },
                { $set: { status: 'failed', error: error.message } }
            );
        }
        res.status(500).send('Error uploading file to Backblaze B2.');
    }
});

// Receives encrypted backup chunks from Native Workspace Bridge.
app.post('/api/backup/chunk', async (req, res) => {
    const {
        sessionId,
        nodeId,
        workspaceName,
        filePath,
        fileSize,
        fileHash,
        encryption,
        chunkIndex,
        totalChunks,
        chunkData
    } = req.body || {};

    if (!sessionId || !nodeId || !filePath || !Number.isInteger(chunkIndex) || !Number.isInteger(totalChunks) || !chunkData) {
        return res.status(400).json({ error: 'Invalid backup chunk payload.' });
    }

    let chunkBuffer;
    try {
        chunkBuffer = Buffer.from(chunkData, 'base64');
    } catch {
        return res.status(400).json({ error: 'chunkData must be valid base64.' });
    }

    const key = `${nodeId}:${sessionId}`;
    if (!backupSessionStore.has(key)) {
        backupSessionStore.set(key, {
            sessionId,
            nodeId,
            workspaceName: workspaceName || 'unknown_workspace',
            createdAt: new Date(),
            files: new Map()
        });
    }

    const session = backupSessionStore.get(key);
    if (!session.files.has(filePath)) {
        session.files.set(filePath, {
            path: filePath,
            size: fileSize || 0,
            hash: fileHash || null,
            encryption: encryption || {},
            totalChunks,
            chunks: new Map()
        });
    }

    const fileRecord = session.files.get(filePath);
    fileRecord.totalChunks = totalChunks;
    fileRecord.chunks.set(chunkIndex, chunkBuffer);
    session.updatedAt = new Date();

    return res.json({
        ok: true,
        sessionId,
        filePath,
        chunkIndex,
        receivedChunks: fileRecord.chunks.size,
        totalChunks: fileRecord.totalChunks
    });
});

// Rebuilds encrypted files and writes them to B2 with backup_recovery_node_[nodeId] prefix.
app.post('/api/backup/finalize', async (req, res) => {
    const { sessionId, nodeId, workspaceName, summary } = req.body || {};
    if (!sessionId || !nodeId) {
        return res.status(400).json({ error: 'sessionId and nodeId are required.' });
    }

    const key = `${nodeId}:${sessionId}`;
    const session = backupSessionStore.get(key);
    if (!session) {
        return res.status(404).json({ error: 'Backup session not found.' });
    }

    if (!b2 || !B2_BUCKET_ID || !B2_BUCKET_NAME) {
        return res.status(500).json({ error: 'Backblaze B2 not configured or authorized.' });
    }

    try {
        const bucketPrefix = `backup_recovery_node_${nodeId}/${sessionId}`;
        const uploaded = [];

        for (const [filePath, fileRecord] of session.files.entries()) {
            const expectedChunks = fileRecord.totalChunks;
            const missingChunks = [];
            for (let i = 0; i < expectedChunks; i += 1) {
                if (!fileRecord.chunks.has(i)) missingChunks.push(i);
            }
            if (missingChunks.length) {
                throw new Error(`Missing chunks for ${filePath}: ${missingChunks.slice(0, 10).join(',')}`);
            }

            const ordered = [];
            for (let i = 0; i < expectedChunks; i += 1) {
                ordered.push(fileRecord.chunks.get(i));
            }
            const encryptedFileBuffer = Buffer.concat(ordered);
            const safePath = sanitizeBackupPath(filePath).replace(/\//g, '__');
            const remoteName = `${bucketPrefix}/${safePath}.enc`;

            await uploadBufferToB2(encryptedFileBuffer, remoteName, 'application/octet-stream');
            uploaded.push({
                filePath,
                cloudPath: remoteName,
                chunks: expectedChunks,
                encryptedBytes: encryptedFileBuffer.length
            });
        }

        const manifestRemoteName = `${bucketPrefix}/manifest.json`;
        const manifest = {
            sessionId,
            nodeId,
            workspaceName: workspaceName || session.workspaceName,
            createdAt: session.createdAt,
            finalizedAt: new Date().toISOString(),
            files: uploaded,
            summary: summary || null
        };
        await uploadBufferToB2(
            Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
            manifestRemoteName,
            'application/json'
        );

        backupSessionStore.delete(key);
        logTelemetryToMongo('info', 'Backup recovery session finalized', {
            nodeId,
            sessionId,
            uploadedFiles: uploaded.length
        });

        return res.json({
            ok: true,
            uploadedFiles: uploaded.length,
            bucketPrefix,
            manifestPath: manifestRemoteName
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// --- Socket.io events ---
io.on('connection', (socket) => {
    const authObj = socket.handshake?.auth || {};
    const rawHandshakeNodeId = authObj.nodeId || socket.handshake?.query?.nodeId;
    if (!rawHandshakeNodeId) {
        console.error(`[ERROR] Missing nodeId in handshake.auth: ${JSON.stringify(authObj)}`);
    }
    const handshakeNodeId = rawHandshakeNodeId || "FORCE-IDENTIFIED-NODE";
    const handshakeNodeRuntime = normalizeNodeRuntime(socket.handshake?.auth?.nodeRuntime || socket.handshake?.query?.nodeRuntime);
    console.log(`[INFO] Socket.io client connected { nodeId: '${handshakeNodeId}', nodeRuntime: '${handshakeNodeRuntime}', socketId: '${socket.id}' }`);
    logTelemetryToMongo('info', 'Socket.io client connected', {
        socketId: socket.id,
        nodeId: handshakeNodeId,
        nodeRuntime: handshakeNodeRuntime
    });

    // Node registration handshake.
    socket.on('register_node', (data) => {
        if (data.nodeId) {
            const nodeRuntime = normalizeNodeRuntime(data.nodeRuntime);
            const nodeChannel = data.nodeChannel || 'workspace_api';
            const metadata = {
                nodeId: data.nodeId,
                nodeRuntime,
                nodeChannel,
                socketId: socket.id,
                userAgent: data.userAgent || 'unknown',
                connectedAt: new Date().toISOString()
            };
            nodeSocketMap[data.nodeId] = socket.id;
            nodeSessionMap[data.nodeId] = metadata;
            socket.data.nodeId = data.nodeId;
            socket.data.nodeRuntime = nodeRuntime;

            console.log(`SystemBridge node registered: ${data.nodeId} (${nodeRuntime}) with socket ID ${socket.id}`);
            logTelemetryToMongo('info', 'SystemBridge node registration completed.', metadata);
            io.emit('vincular_confirmado', {
                message: '¡Vínculo establecido con éxito! Ya veo tu Workspace.',
                nodeId: data.nodeId,
                nodeRuntime,
                nodeChannel
            });
        } else {
            console.error(`[ERROR] Missing nodeId in register_node. handshake.auth: ${JSON.stringify(authObj)}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
        logTelemetryToMongo('info', 'Socket.io client disconnected', { socketId: socket.id });
        for (const nodeId in nodeSocketMap) {
            if (nodeSocketMap[nodeId] === socket.id) {
                delete nodeSocketMap[nodeId];
                delete nodeSessionMap[nodeId];
                console.log(`SystemBridge node ${nodeId} unregistered due to disconnect.`);
                break;
            }
        }
    });

    socket.on('node_report', async (data) => {
        console.log('SystemBridge telemetry report:', data);
        if (!data.nodeId) {
            data.nodeId = `active_node_${socket.id}`;
            console.warn(`⚠️ Received node_report without nodeId. Assigned temporary ID: ${data.nodeId}`);
        }
        try {
            const result = await TelemetryReport.updateOne(
                { nodeId: data.nodeId },
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

            if (result.upsertedCount > 0 || (result.matchedCount > 0 && result.modifiedCount > 0)) {
                 console.log(`✅ Node report processed for node: ${data.nodeId}`);
            }

        } catch (dbError) {
            console.error("❌ Error updating/inserting TelemetryReport:", dbError.message);
        }
        io.emit('dashboard_update', { type: 'node_status', nodeId: data.nodeId, status: 'online' });
    });

    socket.on('command', (commandData) => {
        console.log(`Command received from dashboard for SystemBridge node ${commandData.nodeId}:`, commandData.command);
        const allowedCommands = new Set(['open_workspace', 'createFile', 'removeFile', 'moveFile']);
        if (!allowedCommands.has(commandData.command)) {
            console.warn(`Unsupported workspace command: ${commandData.command}`);
            return;
        }

        const targetSocketId = nodeSocketMap[commandData.nodeId];
        const targetSession = nodeSessionMap[commandData.nodeId] || {};
        if (targetSocketId) {
            console.log(`Routing workspace command ${commandData.command} to node ${commandData.nodeId} (socket: ${targetSocketId})...`);
            io.to(targetSocketId).emit('workspace_file_action', {
                requestId: commandData.requestId || null,
                command: commandData.command,
                args: commandData.args || {},
                nodeRuntime: targetSession.nodeRuntime || 'native_workspace'
            });
        } else {
            console.warn(`❌ SystemBridge node ${commandData.nodeId} no encontrado o no registrado para comando ${commandData.command}.`);
        }
    });

    socket.on('file_metadata', (metadata) => {
        console.log('asset_sync metadata telemetry:', metadata);
    });

    socket.on('system_integrity_report', (report) => {
        if (!report?.nodeId) {
            console.warn('system_integrity_report ignored: missing nodeId');
            return;
        }

        latestIntegrityReports[report.nodeId] = {
            receivedAt: new Date().toISOString(),
            summary: report.summary || {},
            workspaceName: report.workspaceName || 'unknown_workspace'
        };

        logTelemetryToMongo('info', 'System integrity report received', {
            nodeId: report.nodeId,
            workspaceName: report.workspaceName || 'unknown_workspace',
            totalFiles: report?.summary?.totalFiles || 0,
            totalDirs: report?.summary?.totalDirs || 0,
            totalBytes: report?.summary?.totalBytes || 0
        });

        io.emit('dashboard_update', {
            type: 'system_integrity_report',
            nodeId: report.nodeId,
            summary: report.summary || {},
            workspaceName: report.workspaceName || 'unknown_workspace',
            timestamp: report.scannedAt || new Date().toISOString()
        });
    });

    socket.on('file_content_result', (data) => {
        if (!data?.nodeId) {
            console.warn('file_content_result ignored: missing nodeId');
            return;
        }

        console.log(`[File Content] ${data.path} read by node ${data.nodeId} (${data.size} bytes)`);
        
        logTelemetryToMongo('info', 'File content read', {
            nodeId: data.nodeId,
            path: data.path,
            size: data.size
        });

        io.emit('dashboard_update', {
            type: 'file_content_result',
            nodeId: data.nodeId,
            path: data.path,
            size: data.size,
            timestamp: data.timestamp
        });
    });

    socket.on('file_action_error', (data) => {
        if (!data?.nodeId) {
            console.warn('file_action_error ignored: missing nodeId');
            return;
        }

        console.error(`[File Action Error] ${data.action} failed: ${data.error}`);
        
        logTelemetryToMongo('error', `File action failed: ${data.action}`, {
            nodeId: data.nodeId,
            action: data.action,
            error: data.error,
            params: data.params
        });

        io.emit('dashboard_update', {
            type: 'file_action_error',
            nodeId: data.nodeId,
            action: data.action,
            error: data.error,
            timestamp: data.timestamp
        });
    });
});

// --- Startup ---
async function startServer() {
    await authorizeB2();
    await connectMongo();


    httpServer.listen(PORT, () => {
        console.log(`🚀 SystemBridge Server active on http://localhost:${PORT}`);
        console.log(`Socket.io listening on port ${PORT}`);
    });
}

startServer();

// Graceful shutdown
process.on('beforeExit', async () => {
    if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
        console.log("MongoDB connection closed (Mongoose).");
    }
});
