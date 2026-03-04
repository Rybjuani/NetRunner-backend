// app-core.js - NetRunner Pro: Experiencia Fluida

const state = {
    history: [],
    dirHandle: null,
    ui: {
        container: document.querySelector('.app-container'),
        chatArea: document.getElementById('chat-messages'),
        inputArea: document.querySelector('.input-area'),
        form: document.getElementById('chat-form'),
        input: document.getElementById('user-input'),
        statusIndicator: document.getElementById('connection-indicator')
    }
};

window.addEventListener('DOMContentLoaded', () => {
    renderLanding();
});

// 1. PANTALLA DE INICIO (LANDING)
function renderLanding() {
    state.ui.chatArea.innerHTML = '';
    state.ui.inputArea.classList.add('hidden'); // Ocultar input hasta conectar

    const landing = document.createElement('div');
    landing.className = 'landing-screen animate-fade-in';
    landing.innerHTML = `
        <div class="logo-large">
            <i class="fa-solid fa-bolt-lightning"></i>
        </div>
        <h1>NetRunner</h1>
        <p>Asistente de Ingeniería Autónomo</p>
        
        <button id="start-btn" class="start-btn">
            <i class="fa-solid fa-power-off"></i> Iniciar Sesión
        </button>
        <div class="disclaimer">Se solicitará acceso a tu carpeta de trabajo.</div>
    `;

    state.ui.chatArea.appendChild(landing);

    document.getElementById('start-btn').onclick = async () => {
        try {
            // Solicitar acceso a carpeta raíz (Escritorio o Proyectos)
            state.dirHandle = await window.showDirectoryPicker();
            enterWorkspace();
        } catch (e) {
            console.warn("Acceso denegado:", e);
            // Si cancela, entramos en modo solo-lectura/web
            enterWorkspace(false);
        }
    };
}

// 2. ENTRAR AL ESPACIO DE TRABAJO
function enterWorkspace(hasAccess = true) {
    state.ui.chatArea.innerHTML = '';
    state.ui.inputArea.classList.remove('hidden');
    state.ui.input.focus();

    // Mensaje inicial sutil
    const statusMsg = hasAccess 
        ? "Sistema conectado. Acceso a archivos habilitado." 
        : "Modo Web activo. Sin acceso a disco local.";
    
    appendSystemMessage(statusMsg);
    
    updateStatus(hasAccess);
    setupEvents();
}

function updateStatus(connected) {
    if (state.ui.statusIndicator) {
        state.ui.statusIndicator.className = `status-dot ${connected ? 'online' : 'offline'}`;
        state.ui.statusIndicator.title = connected ? 'Conectado al Disco' : 'Desconectado';
    }
}

function setupEvents() {
    state.ui.form.onsubmit = async (e) => {
        e.preventDefault();
        const text = state.ui.input.value.trim();
        if (!text) return;

        appendMessage('user', text);
        state.ui.input.value = '';
        state.ui.input.style.height = 'auto';

        await processUserRequest(text);
    };

    // Auto-resize
    state.ui.input.oninput = () => {
        state.ui.input.style.height = 'auto';
        state.ui.input.style.height = Math.min(state.ui.input.scrollHeight, 150) + 'px';
    };
}

// 3. PROCESAMIENTO DE PETICIONES
async function processUserRequest(text) {
    const loadingId = showLoading();

    // System Prompt Dinámico
    const systemPrompt = `Eres NetRunner. Tu objetivo es EJECUTAR tareas.
    Estado del sistema: ${state.dirHandle ? 'ACCESO TOTAL AL DISCO' : 'SOLO WEB'}.
    
    INSTRUCCIONES:
    1. Si te piden un archivo y tienes acceso, CRÉALO SILENCIOSAMENTE.
       Usa: [FILE:nombre.ext]contenido[/FILE]
    2. Si te piden abrir una web:
       Usa: [URL:https://sitio.com]
    3. Sé breve. No expliques obviedades.`;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                messages: [{ role: 'system', content: systemPrompt }, ...state.history, { role: 'user', content: text }],
                model: CONFIG.DEFAULT_MODEL 
            })
        });

        const data = await response.json();
        removeLoading(loadingId);
        
        state.history.push({ role: 'user', content: text });
        state.history.push({ role: 'assistant', content: data.text });
        
        executeAICommands(data.text);

    } catch (e) {
        removeLoading(loadingId);
        appendMessage('assistant', "⚠️ Error de conexión.");
    }
}

// 4. EJECUCIÓN DE COMANDOS
async function executeAICommands(text) {
    const msgId = appendMessage('assistant', text);
    const container = document.getElementById(msgId);

    // Archivos
    const fileMatch = text.match(/\[FILE:(.*?)\]([\s\S]*?)\[\/FILE\]/);
    if (fileMatch) {
        const [_, filename, content] = fileMatch;
        await saveFile(filename, content, container);
    }

    // URLs
    const urlMatch = text.match(/\[URL:(.*?)\]/);
    if (urlMatch) {
        window.open(urlMatch[1], '_blank');
        addTag(container, 'globe', `Abierto: ${urlMatch[1]}`);
    }
}

async function saveFile(filename, content, container) {
    if (state.dirHandle) {
        try {
            const fileHandle = await state.dirHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            addTag(container, 'check', `Guardado: ${filename}`);
        } catch (e) {
            addTag(container, 'xmark', `Error guardando ${filename}`);
        }
    } else {
        // Fallback descarga
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        addTag(container, 'download', `Descargado: ${filename}`);
    }
}

// 5. UI COMPONENTS
function appendMessage(role, text) {
    const div = document.createElement('div');
    div.id = `msg-${Date.now()}`;
    div.className = `message message-${role} animate-slide-up`;
    
    // Limpiar comandos
    const cleanText = text.replace(/\[FILE:.*?\][\s\S]*?\[\/FILE\]/g, '')
                          .replace(/\[URL:.*?\]/g, '')
                          .trim();
                          
    if (cleanText) {
        div.innerHTML = cleanText.replace(/\n/g, '<br>');
        state.ui.chatArea.appendChild(div);
        scrollToBottom();
    }
    return div.id;
}

function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerText = text;
    state.ui.chatArea.appendChild(div);
}

function addTag(container, icon, text) {
    const tag = document.createElement('div');
    tag.className = 'status-tag';
    tag.innerHTML = `<i class="fa-solid fa-${icon}"></i> ${text}`;
    container.appendChild(tag);
}

function showLoading() {
    const id = `loader-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message message-assistant loading';
    div.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    state.ui.chatArea.appendChild(div);
    scrollToBottom();
    return id;
}

function removeLoading(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function scrollToBottom() {
    state.ui.chatArea.scrollTop = state.ui.chatArea.scrollHeight;
}
