// server.js - NetRunner v5.7 (Robust Comms)
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

// MongoDB
const mongoClient = new MongoClient(MONGO_URI);
let logCollection;

async function connectMongo() {
    try {
        await mongoClient.connect();
        logCollection = mongoClient.db("netrunner_logs").collection("sync_server_logs");
        console.log("💾 MongoDB Conectado.");
    } catch (e) {
        console.error("❌ Fallo en conexión a MongoDB", e);
    }
}

// Crear directorio de subidas
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Express
app.use(express.static(path.join(__dirname, 'public')));
const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor NetRunner activo en puerto ${PORT}`);
    connectMongo();
});

// --- SERVIDOR WEBSOCKET ---
const wss = new WebSocketServer({ server });
const fileAssemblers = {}; // Almacena los chunks de archivos

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`🔗 Nuevo agente conectado desde ${clientIp}`);
    logToMongo('info', 'Agente conectado', { clientIp });
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (message) => {
        try {
            // Distinguir entre JSON y binario (chunks)
            if (Buffer.isBuffer(message)) {
                const assembler = ws.currentAssembler;
                if (assembler) {
                    fs.appendFileSync(assembler.filePath, message);
                    console.log(`📦 Recibido chunk para ${assembler.filename}`);
                }
            } else {
                const data = JSON.parse(message.toString());

                if (data.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong' }));
                } else if (data.type === 'file_chunk') {
                    handleFileChunk(ws, data);
                } else {
                    console.log(`📥 Mensaje del agente: ${message.toString()}`);
                }
            }
        } catch (e) {
            console.error('Error procesando mensaje:', e);
        }
    });

    ws.on('close', () => {
        console.log(`🔌 Agente desconectado: ${clientIp}`);
        logToMongo('info', 'Agente desconectado', { clientIp });
    });
});

function handleFileChunk(ws, data) {
    const { filename, chunk_index, is_last } = data;
    
    if (chunk_index === 0) {
        const filePath = path.join(UPLOAD_DIR, `${Date.now()}-${filename}`);
        ws.currentAssembler = { filename, filePath, chunks: 0 };
        console.log(`📥 Iniciando recepción de ${filename} en ${filePath}`);
    }

    if (is_last) {
        const assembler = ws.currentAssembler;
        if (assembler) {
            console.log(`✅ Archivo ${assembler.filename} ensamblado completamente.`);
            logToMongo('info', 'Archivo recibido', { filename: assembler.filename, path: assembler.filePath });
            
            // Aquí iría la lógica para subir el archivo a S3/B2
            // Por ejemplo: uploadToB2(assembler.filePath);
            
            ws.currentAssembler = null; // Limpiar ensamblador
        }
    }
}

// --- HEARTBEAT CHECK ---
const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) {
            console.log("💔 Terminando conexión inactiva.");
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

// --- HELPERS ---
function logToMongo(level, message, metadata = {}) {
    if (logCollection) {
        logCollection.insertOne({
            level,
            message,
            timestamp: new Date(),
            server: 'NetRunner v5.7',
            ...metadata,
        }).catch(console.error);
    }
}
