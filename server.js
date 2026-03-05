// server.js - NetRunner Cloud Proxy v5.6
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const { fetch: _fetch } = globalThis;
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENCODE_ZEN_API_KEY = process.env.OPENCODE_ZEN_API_KEY;
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.post("/api/chat", async (req, res) => {
    const { messages, model } = req.body;
    
    // Determinar proveedor y modelo
    const modelId = model || 'groq:llama-3.3-70b-versatile';
    const [provider, modelName] = modelId.split(':');
    
    let apiKey = '';
    let apiUrl = '';
    
    if (provider === 'groq') {
        apiKey = GROQ_API_KEY;
        apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    } else if (provider === 'zen' || provider === 'opencode') {
        apiKey = OPENCODE_ZEN_API_KEY;
        apiUrl = 'https://api.opencode.ai/v1/chat/completions';
    }

    if (!apiKey) {
        return res.status(503).json({ 
            error: `API Key para ${provider} no configurada en el servidor.` 
        });
    }

    try {
        const response = await _fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    { role: 'system', content: `Eres NetRunner Pro. Tu misión es ACTUAR sobre el PC del usuario vía Web API.
                    - Si no tienes permiso de archivos, DEBES usar el comando: [REQUEST_PERMISSION]
                    - Para crear archivos usa: [FILE:nombre.ext]contenido[/FILE]
                    - Para abrir webs usa: [URL:https://sitio.com]
                    No des tutoriales. Si te piden un archivo y no hay permiso, solo di: "Necesito acceso para crear ese archivo." seguido del comando.` },
                    ...messages
                ],
                temperature: 0.7,
                max_tokens: 2048
            })
        });

        const data = await response.json();
        
        if (data.choices && data.choices[0]) {
            res.json({ text: data.choices[0].message.content });
        } else {
            console.error("AI Error Response:", data);
            res.status(500).json({ error: data.error?.message || "Respuesta inválida de la IA" });
        }

    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 NetRunner Cloud v5.6 activo en puerto ${PORT}`);
    console.log(`🔑 Groq: ${GROQ_API_KEY ? '✅' : '❌'}`);
    console.log(`🔑 OpenCode: ${OPENCODE_ZEN_API_KEY ? '✅' : '❌'}`);
});
