// server.js - NetRunner Native Core v5.0
import express from "express";
import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import os from "os";

const execAsync = promisify(exec);
const { fetch: _fetch } = globalThis;

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

// Configuración
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));

// --- API NATIVA DEL SISTEMA (EL NÚCLEO) ---

// 1. Ejecutar Comandos de Terminal (Shell)
app.post("/api/system/exec", async (req, res) => {
    const { command } = req.body;
    console.log(`💻 Ejecutando: ${command}`);
    try {
        const { stdout, stderr } = await execAsync(command);
        res.json({ output: stdout || stderr, success: true });
    } catch (error) {
        res.json({ output: error.message, success: false });
    }
});

// 2. Sistema de Archivos (Acceso Total)
app.post("/api/system/fs", async (req, res) => {
    const { action, path: targetPath, content } = req.body;
    
    // Resolver rutas relativas (ej: "~/Desktop")
    const resolvedPath = targetPath.replace(/^~/, os.homedir());
    
    console.log(`📂 FS ${action}: ${resolvedPath}`);

    try {
        if (action === 'write') {
            await fs.writeFile(resolvedPath, content, 'utf8');
            res.json({ success: true, message: "Archivo escrito correctamente" });
        } else if (action === 'read') {
            const data = await fs.readFile(resolvedPath, 'utf8');
            res.json({ success: true, content: data });
        } else if (action === 'list') {
            const files = await fs.readdir(resolvedPath);
            res.json({ success: true, files });
        } else {
            res.status(400).json({ error: "Acción desconocida" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- API CHAT (IA) ---
app.post("/api/chat", async (req, res) => {
    const { messages, model } = req.body;
    
    // Inyectar contexto del sistema real
    const sysInfo = `Host: ${os.type()} ${os.release()} | User: ${os.userInfo().username} | Home: ${os.homedir()}`;
    
    // Añadir prompt oculto de capacidades
    const augmentedMessages = [
        { role: 'system', content: `Estás corriendo en un servidor nativo Node.js. 
          TIENES ACCESO TOTAL AL SISTEMA.
          - Para ejecutar comandos de terminal usa: [EXEC: comando]
          - Para crear archivos usa: [FILE: ruta/absoluta]contenido[/FILE]
          - Para listar archivos usa: [EXEC: ls -la ruta]
          
          INFO SISTEMA: ${sysInfo}
          
          IMPORTANTE: Si te piden algo del sistema (configuraciones, favoritos), usa [EXEC] para buscar los archivos o correr comandos de sistema.` 
        },
        ...messages
    ];

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model || 'llama-3.3-70b-versatile',
                messages: augmentedMessages,
                temperature: 0.5
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        res.json({ text: data.choices[0].message.content });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n⚡ NETRUNNER NATIVE CORE ACTIVO en http://localhost:${PORT}`);
    console.log(`🔓 Acceso total al sistema habilitado para el usuario: ${os.userInfo().username}\n`);
});
