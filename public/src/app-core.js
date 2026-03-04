// app-core.js - Cerebro Autónomo de NetRunner v4

const DOM = {
    chat: document.getElementById('chat-messages'),
    form: document.getElementById('chat-form'),
    input: document.getElementById('user-input'),
    statusPill: document.getElementById('bridge-status'),
    modal: document.getElementById('preview-modal'),
    frame: document.getElementById('preview-frame'),
    closePreview: document.getElementById('close-preview')
};

const state = {
    history: [],
    bridge: { connected: false, socket: null },
    os: 'Windows' // Default
};

// 1. INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', () => {
    detectOS();
    renderWelcome();
    connectBridge();
    setupEvents();
});

function detectOS() {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('linux')) state.os = 'Linux';
    else if (platform.includes('mac')) state.os = 'macOS';
    console.log(`💻 Sistema detectado: ${state.os}`);
}

function setupEvents() {
    DOM.form.onsubmit = async (e) => {
        e.preventDefault();
        const text = DOM.input.value.trim();
        if (!text) return;
        if (state.history.length === 0) DOM.chat.innerHTML = '';
        appendMessage('user', text);
        DOM.input.value = '';
        await sendMessage(text);
    };
    DOM.closePreview.onclick = () => DOM.modal.classList.add('hidden');
}

// 2. CONEXIÓN AL PC (BRIDGE)
function connectBridge() {
    if (state.bridge.socket) return;
    try {
        state.bridge.socket = new WebSocket('ws://localhost:8080');
        state.bridge.socket.onopen = () => {
            state.bridge.connected = true;
            updateStatusUI(true);
        };
        state.bridge.socket.onmessage = (msg) => {
            if (msg.data.includes('SYSTEM_READY')) {
                state.bridge.connected = true;
                updateStatusUI(true);
            }
        };
        state.bridge.socket.onclose = () => {
            state.bridge.connected = false;
            updateStatusUI(false);
            state.bridge.socket = null;
            setTimeout(connectBridge, 5000);
        };
        state.bridge.socket.onerror = () => updateStatusUI(false);
    } catch (e) { updateStatusUI(false); }
}

function updateStatusUI(online) {
    state.ui.statusPill.className = `status-pill ${online ? 'online' : 'offline'}`;
    state.ui.statusPill.querySelector('.label').textContent = online ? 'PC Conectado' : 'PC Desconectado';
}

// 3. COMUNICACIÓN CON LA IA (MODO AUTÓNOMO)
async function sendMessage(text) {
    const loadingId = showLoading();
    
    // INSTRUCCIONES MAESTRAS PARA LA IA
    const systemPrompt = `Eres NetRunner Pro, un ingeniero autónomo. NO DES PASOS NI INSTRUCCIONES. EJECUTA.
    
    Tus herramientas (ÚSALAS SIEMPRE QUE TE PIDAN ALGO):
    1. ARCHIVOS: Para crear/escribir archivos usa: <file path="RUTA">CONTENIDO</file>
       - En Windows el escritorio suele ser: C:/Users/USUARIO/Desktop/archivo.txt (pregunta el usuario si no sabes)
       - En Linux el escritorio es: ~/Desktop/archivo.txt
    2. NAVEGADOR: Para abrir webs usa JSON: {"action": "open_url", "url": "https://url.com"}
    
    Si te piden "abre youtube y crea un archivo", responde con el JSON y el tag <file> en el mismo mensaje.`;

    try {
        const messages = [
            { role: 'system', content: systemPrompt },
            ...state.history, 
            { role: 'user', content: text }
        ];

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, model: CONFIG.DEFAULT_MODEL })
        });

        const data = await response.json();
        removeLoading(loadingId);
        
        // Procesar y Guardar historial
        processAIResponse(data.text);
        state.history.push({ role: 'user', content: text });
        state.history.push({ role: 'assistant', content: data.text });

    } catch (error) {
        removeLoading(loadingId);
        appendMessage('assistant', `⚠️ Error: No pude contactar con mi cerebro. ${error.message}`);
    }
}

function processAIResponse(text) {
    const msgId = appendMessage('assistant', text);
    const container = document.getElementById(msgId);

    // Ejecutar Acción de Navegador (JSON)
    const browserMatch = text.match(/\{"action"\s*:\s*"open_url"[\s\S]*?\}/i);
    if (browserMatch) {
        try {
            const action = JSON.parse(browserMatch[0]);
            window.open(action.url, '_blank');
            renderActionCard(container, 'globe', 'Abriendo Navegador', action.url, 'success');
        } catch(e) {}
    }

    // Ejecutar Acción de Archivos (Tags)
    const fileMatch = text.match(/<file\s+path="([^"]+)">([\s\S]*?)<\/file>/i);
    if (fileMatch) {
        const [_, path, content] = fileMatch;
        handleFileExecution(path, content, container);
    }
}

async function handleFileExecution(path, content, container) {
    const cardId = renderActionCard(container, 'file-lines', 'Creando Archivo', path, 'running');
    
    if (window.FileSystemSimple && state.bridge.connected) {
        const result = await window.FileSystemSimple.createFile(path, content);
        if (result.success) {
            updateActionCard(cardId, 'success', `¡Listo! Archivo guardado en ${path}`);
        } else {
            updateActionCard(cardId, 'error', `Fallo: ${result.message}`);
        }
    } else {
        // Fallback: Descarga si no hay bridge
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = path.split('/').pop();
        a.click();
        updateActionCard(cardId, 'success', 'Bridge no activo: Descargado en el navegador.');
    }
}

// 4. UI HELPERS
function appendMessage(role, text) {
    const id = `msg-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = `message message-${role} animate-slide-up`;
    
    // Limpiar tags del texto visible
    let cleanText = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
                        .replace(/<file[\s\S]*?<\/file>/g, '')
                        .replace(/\{"action"[\s\S]*?\}/g, '')
                        .trim();
    
    if (!cleanText && role === 'assistant') cleanText = "Hecho. He ejecutado las acciones solicitadas.";

    div.innerHTML = cleanText.replace(/\n/g, '<br>');
    DOM.chat.appendChild(div);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
    return id;
}

function renderActionCard(container, icon, title, details, status) {
    const id = `card-${Date.now()}`;
    const card = document.createElement('div');
    card.id = id;
    card.className = `action-card status-${status}`;
    card.innerHTML = `
        <div class="action-icon"><i class="fa-solid fa-${icon}"></i></div>
        <div class="action-info">
            <h4>${title}</h4>
            <p>${details}</p>
        </div>
    `;
    container.appendChild(card);
    return id;
}

function updateActionCard(id, status, details) {
    const card = document.getElementById(id);
    if (card) {
        card.className = `action-card status-${status}`;
        card.querySelector('p').textContent = details;
        if (status === 'success') card.querySelector('.action-icon').innerHTML = '<i class="fa-solid fa-check"></i>';
    }
}

function showLoading() {
    const id = `load-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message message-assistant loading';
    div.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Procesando...';
    DOM.chat.appendChild(div);
    return id;
}

function removeLoading(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function renderWelcome() {
    DOM.chat.innerHTML = `
        <div class="welcome-screen">
            <h1>Hola, soy NetRunner</h1>
            <p>Pídeme cualquier cosa. Puedo crear archivos en tu PC y abrir webs.</p>
            <div class="recipe-grid">
                <button onclick="document.getElementById('user-input').value='Abre youtube y crea un saludo.txt en mi escritorio'; document.getElementById('chat-form').requestSubmit();" class="recipe-btn">
                    <i class="fa-solid fa-magic"></i>
                    <h4>Prueba de Superpoderes</h4>
                </button>
            </div>
        </div>
    `;
}
