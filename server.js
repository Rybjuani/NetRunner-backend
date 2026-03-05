// server.js - NetRunner v5.8 (Dashboard Edition)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import os from 'os';

// --- CONFIGURACIÓN ---
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ffasito:Reputo11.@rybjuani.ewuurhu.mongodb.net/?appName=rybjuani";
const UPLOAD_DIR = path.join(os.tmpdir(), 'netrunner-uploads');

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

    ws.on('message', (message) => {
        // ... (código existente)
    });

    ws.on('close', () => {
        logToMongo('info', 'Agente desconectado', { agentId: ws.id });
    });
});

function handleFileChunk(ws, data) {
    const { filename, chunk_index, is_last } = data;
    
    if (chunk_index === 0) {
        const filePath = path.join(UPLOAD_DIR, `${Date.now()}-${filename}`);
        ws.currentAssembler = { filename, filePath, size: 0 };
    }

    // El buffer binario llega después
    // ...

    if (is_last) {
        const assembler = ws.currentAssembler;
        if (assembler) {
            logToMongo('info', 'Archivo recibido', { filename: assembler.filename, size: assembler.size });
            filesCollection.insertOne({
                filename: assembler.filename,
                size: assembler.size,
                timestamp: new Date()
            });
            ws.currentAssembler = null;
        }
    }
}


// --- HEARTBEAT CHECK ---
// ... (código existente)

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
