// server.js - NetRunner Pro v4.0 - Backend simplificado
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const { fetch: _fetch } = globalThis;

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

// ===== VARIABLES DE ENTORNO =====
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENCODE_ZEN_API_KEY = process.env.OPENCODE_ZEN_API_KEY;
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ===== RATE LIMITING =====
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 30;

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimiter.has(ip)) {
    rateLimiter.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const userLimit = rateLimiter.get(ip);
  
  if (now > userLimit.resetTime) {
    rateLimiter.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  if (userLimit.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ 
      error: "Demasiadas peticiones. Intenta de nuevo en un minuto.",
      retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
    });
  }
  
  userLimit.count++;
  next();
}

// Limpiar rate limiter cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimiter.entries()) {
    if (now > data.resetTime + 300000) { // Mantener 5min extra
      rateLimiter.delete(ip);
    }
  }
}, 60000); // Cada minuto

// ===== CORS =====
app.use((req, res, next) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://netrunner-pro.up.railway.app',
    'https://rybjuani.github.io'
  ];
  
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
});

// ===== HEADERS DE SEGURIDAD =====
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Origin-Agent-Cluster', '?1');
  next();
});

app.use(express.json({ limit: '10mb' }));

// ===== VALIDACIÓN DE BODY =====
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'JSON inválido en el body' });
  }
  next();
});

// ===== ARCHIVOS ESTÁTICOS =====
app.use(express.static(PUBLIC_DIR, {
  maxAge: NODE_ENV === 'production' ? '1d' : 0,
  etag: true
}));

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  const availableProviders = [];
  
  if (GROQ_API_KEY) availableProviders.push('groq');
  if (OPENCODE_ZEN_API_KEY) availableProviders.push('opencode');
  
  res.json({
    ok: true,
    mode: availableProviders[0] || 'none',
    providers: availableProviders,
    version: '4.0.0'
  });
});

// ===== FUNCIONES DE API =====

async function callGroq(messages, model, retries = 2) {
  const modelName = model?.split(':')[1] || 'llama-3.1-8b-instant';
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await _fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: messages,
          max_tokens: 2048,
          temperature: 0.7
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Error de API');
      }
      
      const data = await response.json();
      
      return {
        text: data.choices[0].message.content,
        usage: data.usage,
        provider: 'groq',
        model: modelName
      };
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (attempt === retries) {
        throw error;
      }
      
      console.log(`⚠️  Reintento ${attempt + 1}/${retries}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

async function callOpenCode(messages, model, retries = 2) {
  const modelName = model?.split(':')[1] || 'opencodezen-bigpickle';
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await _fetch('https://api.opencode.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENCODE_ZEN_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: messages,
          max_tokens: 2048,
          temperature: 0.7
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Error de API');
      }
      
      const data = await response.json();
      
      return {
        text: data.choices[0].message.content,
        usage: data.usage,
        provider: 'opencode',
        model: modelName
      };
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (attempt === retries) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

// ===== ENDPOINT PRINCIPAL DE CHAT =====
app.post("/api/chat", rateLimit, async (req, res) => {
  const { messages, model } = req.body;
  
  // Validación
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Se requiere array de mensajes" });
  }
  
  if (messages.length === 0) {
    return res.status(400).json({ error: "Array de mensajes vacío" });
  }
  
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return res.status(400).json({ 
        error: "Cada mensaje debe tener 'role' y 'content'",
        invalid: msg
      });
    }
    
    if (!['user', 'assistant', 'system'].includes(msg.role)) {
      return res.status(400).json({ 
        error: `Role inválido: ${msg.role}. Debe ser 'user', 'assistant' o 'system'` 
      });
    }
    
    if (typeof msg.content !== 'string') {
      return res.status(400).json({ error: "Content debe ser string" });
    }
    
    if (msg.content.length > 50000) {
      return res.status(400).json({ error: "Mensaje demasiado largo (max 50k caracteres)" });
    }
  }
  
  try {
    // Determinar proveedor
    const provider = model?.startsWith('groq:') ? 'groq' : 'opencode';
    let result;
    
    if (provider === 'groq') {
      if (!GROQ_API_KEY) {
        return res.status(503).json({ 
          error: "GROQ_API_KEY no configurada en el servidor",
          hint: "Configura la variable de entorno GROQ_API_KEY"
        });
      }
      result = await callGroq(messages, model);
    } else {
      if (!OPENCODE_ZEN_API_KEY) {
        return res.status(503).json({ 
          error: "OPENCODE_ZEN_API_KEY no configurada en el servidor",
          hint: "Configura la variable de entorno OPENCODE_ZEN_API_KEY"
        });
      }
      result = await callOpenCode(messages, model);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Chat error:', error);
    
    if (error.name === 'AbortError') {
      return res.status(408).json({ 
        error: "Request timeout - la API tardó demasiado en responder" 
      });
    }
    
    res.status(500).json({ 
      error: error.message || "Error procesando request"
    });
  }
});

// ===== STREAMING ENDPOINT =====
app.post("/api/chat/stream", rateLimit, async (req, res) => {
  const { messages, model } = req.body;
  
  // Validación
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Se requiere array de mensajes" });
  }
  
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return res.status(400).json({ error: "Mensaje inválido" });
    }
  }
  
  // Configurar SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  res.write(':ok\n\n');
  
  try {
    const provider = model?.startsWith('groq:') ? 'groq' : 'opencode';
    const modelName = model?.split(':')[1] || 'llama-3.1-8b-instant';
    const apiKey = provider === 'groq' ? GROQ_API_KEY : OPENCODE_ZEN_API_KEY;
    
    if (!apiKey) {
      res.write(`data: ${JSON.stringify({ error: `${provider} API key no configurada` })}\n\n`);
      return res.end();
    }
    
    const apiUrl = provider === 'groq' 
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.opencode.ai/v1/chat/completions';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    const response = await _fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
        stream: true,
        max_tokens: 2048,
        temperature: 0.7
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        res.write('data: [DONE]\n\n');
        res.end();
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }
        
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch (e) {
          // Ignorar errores de parsing
        }
      }
    }
    
  } catch (error) {
    console.error('Streaming error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// ===== MANEJO DE ERRORES 404 =====
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint no encontrado" });
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM recibido, cerrando servidor...');
  process.exit(0);
});

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║           🤖 NetRunner Pro v4.0 - ONLINE              ║
║                                                        ║
║  📡 Puerto: ${PORT.toString().padEnd(41)}║
║  🌍 Entorno: ${NODE_ENV.padEnd(39)}║
║  🔑 Groq: ${(GROQ_API_KEY ? '✅ Configurado' : '❌ No configurado').padEnd(43)}║
║  🔑 OpenCode: ${(OPENCODE_ZEN_API_KEY ? '✅ Configurado' : '❌ No configurado').padEnd(38)}║
║                                                        ║
╚════════════════════════════════════════════════════════╝
  `);
});
