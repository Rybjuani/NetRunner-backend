// server.js - NetRunner v6.0 (Backblaze B2 Integration)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import os from 'os';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

// --- CONFIGURACIÓN ---
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ffasito:Reputo11.@rybjuani.ewuurhu.mongodb.net/?appName=rybjuani";
const UPLOAD_DIR = path.join(os.tmpdir(), 'netrunner-uploads');

// --- B2 CONFIGURATION ---
const B2_ENDPOINT = process.env.B2_ENDPOINT;
const B2_REGION = B2_ENDPOINT ? B2_ENDPOINT.match(/s3\.(.*?)\./)?.[1] || 'us-east-005' : 'us-east-005';
const B2_BUCKET = process.env.B2_BUCKET_NAME;
const B2_ACCESS_KEY_ID = process.env.B2_ACCESS_KEY_ID;
const B2_SECRET_ACCESS_KEY = process.env.B2_SECRET_ACCESS_KEY;

let s3Client = null;
if (B2_ENDPOINT && B2_ACCESS_KEY_ID && B2_SECRET_ACCESS_KEY && B2_BUCKET) {
    s3Client = new S3Client({
        endpoint: B2_ENDPOINT,
        region: B2_REGION,
        credentials: {
            accessKeyId: B2_ACCESS_KEY_ID,
            secretAccessKey: B2_SECRET_ACCESS_KEY
        },
        forcePathStyle: true
    });
    console.log(`☁️ B2 Client configurado. Bucket: ${B2_BUCKET}`);
} else {
    console.warn("⚠️ B2 no configurado. Los archivos se guardarán solo localmente.");
}

// --- INICIALIZACIÓN ---
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mongoClient = new MongoClient(MONGO_URI);
let logCollection;
let filesCollection;

async function connectMongo() {
    try {
        await mongoClient.connect();
        const db = mongoClient.db("netrunner_logs");
        logCollection = db.collection("sync_server_logs");
        filesCollection = db.collection("received_files");
        console.log("💾 MongoDB Conectado.");
    } catch (e) {
        console.error("❌ Fallo en conexión a MongoDB", e);
    }
}

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, 'public')));

// --- RUTA DE DESCARGA DEL AGENTE (PROXY B2) ---
const AGENT_B2_KEY = process.env.AGENT_B2_KEY || 'agent/netrunner_agent.exe';

app.get('/api/download/agent', async (req, res) => {
    // Si está configurado B2, usar como proxy
    if (s3Client && B2_BUCKET) {
        try {
            console.log(`📥 Descargando agente desde B2: ${AGENT_B2_KEY}`);
            
            const command = new GetObjectCommand({
                Bucket: B2_BUCKET,
                Key: AGENT_B2_KEY
            });
            
            const response = await s3Client.send(command);
            
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', 'attachment; filename="netrunner_agent.exe"');
            
            // Stream directo al cliente
            response.Body.pipe(res);
            
            console.log("✅ Agente enviado al cliente");
            
        } catch (error) {
            console.error("❌ Error descargando agente desde B2:", error);
            res.status(500).json({ error: 'Failed to download agent from cloud' });
        }
        return;
    }
    
    // Fallback: servir desde sistema de archivos local
    const AGENT_BINARY_PATH = process.env.AGENT_BINARY_PATH || path.join(__dirname, 'dist', 'netrunner_agent');
    
    if (!fs.existsSync(AGENT_BINARY_PATH)) {
        return res.status(404).json({ error: 'Agent binary not found. Please contact administrator.' });
    }
    
    res.download(AGENT_BINARY_PATH, 'netrunner_agent.exe', (err) => {
        if (err) {
            console.error('Error downloading agent:', err);
            res.status(500).json({ error: 'Download failed' });
        }
    });
});

// --- RUTA DE VERSIÓN ---
app.get('/api/version', (req, res) => {
    res.json({ 
        version: '6.0.0', 
        name: 'NetRunner Sync-Node',
        agentDownloadUrl: '/api/download/agent',
        cloudSource: (s3Client && B2_BUCKET) ? 'backblaze' : 'local'
    });
});

// --- RUTAS DASHBOARD ---
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/dashboard-data', async (req, res) => {
    const agents = Array.from(wss.clients).map(ws => ({
        id: ws.id,
        ip: ws.ip,
        lastSeen: ws.lastSeen
    }));
    const files = await filesCollection.find().sort({ timestamp: -1 }).limit(50).toArray();
    res.json({ agents, files });
});

app.post('/api/force-sync', (req, res) => {
    wss.clients.forEach(ws => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ command: 'start_sync' }));
        }
    });
    res.status(200).send({ message: 'Comando enviado' });
});

const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor NetRunner activo en http://localhost:${PORT}/dashboard`);
    connectMongo();
});

// --- SERVIDOR WEBSOCKET ---
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    ws.id = `agent-${Math.random().toString(36).substr(2, 9)}`;
    ws.ip = req.socket.remoteAddress;
    ws.lastSeen = Date.now();
    ws.isAlive = true;

    logToMongo('info', 'Agente conectado', { agentId: ws.id, clientIp: ws.ip });

    ws.on('pong', () => { ws.isAlive = true; ws.lastSeen = Date.now(); });

    ws.on('message', async (message, isBinary) => {
        if (isBinary) {
            handleBinaryChunk(ws, message);
            return;
        }

        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'file_chunk') {
                handleFileChunkMetadata(ws, data);
            } else if (data.type === 'heartbeat') {
                ws.isAlive = true;
            }
        } catch (e) {
            console.error("Error parseando mensaje:", e);
        }
    });

    ws.on('close', () => {
        logToMongo('info', 'Agente desconectado', { agentId: ws.id });
    });
});

function handleFileChunkMetadata(ws, data) {
    const { filename, chunk_index, is_last, size } = data;
    
    if (chunk_index === 0) {
        const filePath = path.join(UPLOAD_DIR, `${ws.id}-${Date.now()}-${filename}`);
        ws.currentAssembler = { 
            filename, 
            filePath, 
            size: 0,
            agentId: ws.id,
            expectedSize: size 
        };
    }

    if (ws.currentAssembler) {
        ws.currentAssembler.size += data.chunkSize || 0;
    }

    if (is_last) {
        const assembler = ws.currentAssembler;
        if (assembler) {
            finalizeUpload(ws, assembler);
            ws.currentAssembler = null;
        }
    }
}

function handleBinaryChunk(ws, buffer) {
    if (!ws.currentAssembler || !ws.currentAssembler.filePath) return;
    
    const chunkBuffer = Buffer.from(buffer);
    fs.appendFileSync(ws.currentAssembler.filePath, chunkBuffer);
}

async function finalizeUpload(ws, assembler) {
    const { filename, filePath, agentId, expectedSize } = assembler;
    
    // Insertar documento inicial en MongoDB
    const fileDoc = {
        filename,
        size: expectedSize,
        agentId,
        timestamp: new Date(),
        status: 'processing',
        cloudPath: null
    };
    
    if (filesCollection) {
        await filesCollection.insertOne(fileDoc).catch(e => console.error("Error insertando:", e));
    }
    logToMongo('info', 'Archivo recibido, subiendo a B2...', { filename, size: expectedSize, agentId });

    // Subir a B2 si está configurado
    if (s3Client && B2_BUCKET) {
        let retries = 3;
        let uploaded = false;
        
        while (retries > 0 && !uploaded) {
            try {
                const fileContent = fs.readFileSync(filePath);
                const key = `uploads/${agentId}/${Date.now()}-${filename}`;
                
                const upload = new Upload({
                    client: s3Client,
                    params: {
                        Bucket: B2_BUCKET,
                        Key: key,
                        Body: fileContent,
                        ContentType: getContentType(filename)
                    },
                    queueSize: 1
                });

                await upload.done();
                
                // Actualizar estado en MongoDB
                await filesCollection.updateOne(
                    { filename, agentId, timestamp: fileDoc.timestamp },
                    { 
                        $set: { 
                            status: 'persisted',
                            cloudPath: key,
                            persistedAt: new Date()
                        }
                    }
                );

                logToMongo('info', 'Archivo subido a B2', { filename, key, bucket: B2_BUCKET });
                uploaded = true;
                
            } catch (b2Error) {
                retries--;
                console.error(`❌ Error subiendo a B2 (intentos restantes: ${retries}):`, b2Error.message);
                if (retries > 0) await new Promise(r => setTimeout(r, 2000));
            }
        }
        
        if (!uploaded) {
            await filesCollection.updateOne(
                { filename, agentId, timestamp: fileDoc.timestamp },
                { $set: { status: 'error', error: 'Falló después de 3 intentos' } }
            );
        }
    } else {
        // Sin B2 configurado
        await filesCollection.updateOne(
            { filename, agentId, timestamp: fileDoc.timestamp },
            { $set: { status: 'local_only' } }
        );
        logToMongo('warn', 'B2 no configurado, archivo guardado localmente', { filename, filePath });
    }

    // Eliminar archivo temporal
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Archivo temporal eliminado: ${filePath}`);
        }
    } catch (e) {
        console.error("Error eliminando archivo temporal:", e);
    }
}

function getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const types = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.log': 'text/plain'
    };
    return types[ext] || 'application/octet-stream';
}

// --- HEARTBEAT CHECK ---
const heartbeatInterval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// --- CLEANUP DE ARCHIVOS HUÉRFANOS ---
setInterval(async () => {
    try {
        const files = fs.readdirSync(UPLOAD_DIR);
        const now = Date.now();
        const MAX_AGE = 30 * 60 * 1000; // 30 minutos

        for (const file of files) {
            const filePath = path.join(UPLOAD_DIR, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > MAX_AGE) {
                fs.unlinkSync(filePath);
                console.log(`🧹 Cleanup archivo huérfano: ${file}`);
            }
        }

        // Limpiar documentos 'processing' viejos (>1 hora)
        if (filesCollection) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const result = await filesCollection.updateMany(
                { status: 'processing', timestamp: { $lt: oneHourAgo } },
                { $set: { status: 'error', error: 'Timeout - agente desconectado' } }
            );
            if (result.modifiedCount > 0) {
                console.log(`🧹 Limpiados ${result.modifiedCount} documentos huérfanos`);
            }
        }
    } catch (e) {
        console.error("Error en cleanup:", e);
    }
}, 15 * 60 * 1000); // Cada 15 minutos

wss.on('close', () => clearInterval(heartbeatInterval));

function logToMongo(level, message, metadata = {}) {
    if (logCollection) {
        logCollection.insertOne({
            level,
            message,
            timestamp: new Date(),
            ...metadata,
        }).catch(console.error);
    }
}
