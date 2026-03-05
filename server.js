// server.js - NetRunner Cloud Proxy v5.5
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const { fetch: _fetch } = globalThis;
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.post("/api/chat", async (req, res) => {
    const { messages, model } = req.body;

    if (!GROQ_API_KEY) {
        return res.status(500).json({ error: "API Key no configurada en Railway" });
    }

    try {
        const response = await _fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model || 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: `Eres NetRunner Pro. Tu misión es ACTUAR sobre el PC del usuario vía Web API.
                    - Si no tienes permiso de archivos, DEBES usar el comando: [REQUEST_PERMISSION]
                    - Para crear archivos usa: [FILE:nombre.ext]contenido[/FILE]
                    - Para abrir webs usa: [URL:https://sitio.com]
                    No des tutoriales. Si te piden un archivo y no hay permiso, solo di: "Necesito acceso para crear ese archivo." seguido del comando.` },
                    ...messages
                ]
            })
        });

        const data = await response.json();
        
        if (data.choices && data.choices[0]) {
            res.json({ text: data.choices[0].message.content });
        } else {
            res.status(500).json({ error: "Respuesta inválida de la IA" });
        }

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 NetRunner Cloud activo en puerto ${PORT}`);
});
