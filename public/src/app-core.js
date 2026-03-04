// app-core.js - El cerebro de NetRunner v4

const state = {
    history: [],
    bridge: { connected: false, socket: null },
    ui: {
        messages: document.getElementById('chat-messages'),
        form: document.getElementById('chat-form'),
        input: document.getElementById('user-input'),
        statusPill: document.getElementById('bridge-status'),
        modal: document.getElementById('preview-modal'),
        frame: document.getElementById('preview-frame'),
        closePreview: document.getElementById('close-preview')
    }
};

// 1. Inicialización
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    renderWelcome();
    setupEvents();
    connectBridge();
    // Auto-resize para el textarea
    state.ui.input.addEventListener('input', () => {
        state.ui.input.style.height = 'auto';
        state.ui.input.style.height = state.ui.input.scrollHeight + 'px';
    });
}

function setupEvents() {
    state.ui.form.onsubmit = async (e) => {
        e.preventDefault();
        const text = state.ui.input.value.trim();
        if (!text) return;
        
        if (state.history.length === 0) state.ui.messages.innerHTML = '';
        
        appendMessage('user', text);
        state.ui.input.value = '';
        state.ui.input.style.height = 'auto';
        
        await sendMessage(text);
    };

    state.ui.closePreview.onclick = () => {
        state.ui.modal.classList.add('hidden');
        state.ui.frame.srcdoc = '';
    };
}

// 2. Conexión Bridge (PC Local)
function connectBridge() {
    try {
        state.bridge.socket = new WebSocket('ws://localhost:8080');
        
        state.bridge.socket.onopen = () => {
            console.log("🟢 Bridge Conectado");
            updateBridgeStatus(true);
        };

        state.bridge.socket.onmessage = (event) => {
            if (event.data.includes('SYSTEM_READY')) {
                updateBridgeStatus(true);
            }
        };

        state.bridge.socket.onclose = () => {
            updateBridgeStatus(false);
            setTimeout(connectBridge, 5000); // Reintentar
        };
        
        state.bridge.socket.onerror = () => updateBridgeStatus(false);

    } catch (e) {
        updateBridgeStatus(false);
    }
}

function updateBridgeStatus(online) {
    state.bridge.connected = online;
    state.ui.statusPill.className = `status-pill ${online ? 'online' : 'offline'}`;
}

// 3. Comunicación con la IA
async function sendMessage(text) {
    const loadingId = showLoading();
    
    try {
        const messages = [...state.history, { role: 'user', content: text }];
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, model: CONFIG.DEFAULT_MODEL })
        });

        if (!response.ok) throw new Error("Error en la respuesta del servidor");
        const data = await response.json();
        
        removeLoading(loadingId);
        processAIResponse(data.text);
        
        state.history.push({ role: 'user', content: text });
        state.history.push({ role: 'assistant', content: data.text });

    } catch (error) {
        removeLoading(loadingId);
        appendMessage('assistant', `⚠️ Lo siento, tuve un problema: ${error.message}`);
    }
}

function processAIResponse(text) {
    // Limpiar pensamientos del texto visible
    const cleanText = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
    const msgId = appendMessage('assistant', cleanText);
    const container = document.getElementById(msgId);

    // Detectar si la IA creó una web (HTML)
    const htmlMatch = text.match(/<file\s+path="([^"]+\.html)">([\s\S]*?)<\/file>/i);
    if (htmlMatch) {
        const [_, path, content] = htmlMatch;
        renderActionCard(container, {
            type: 'web',
            title: `Página Web Creada: ${path}`,
            details: 'He diseñado una interfaz basada en tu petición.',
            btnLabel: 'Ver Resultado',
            onAction: () => showPreview(content)
        });
    }

    // Detectar acciones de archivos generales
    const fileMatch = text.match(/<file\s+path="([^"]+)">([\s\S]*?)<\/file>/i);
    if (fileMatch && !htmlMatch) {
        renderActionCard(container, {
            type: 'file',
            title: `Archivo Creado: ${fileMatch[1]}`,
            details: 'El archivo ha sido procesado correctamente.',
            btnLabel: 'Descargar',
            onAction: () => downloadFile(fileMatch[1], fileMatch[2])
        });
    }
}

// 4. Componentes de UI
function appendMessage(role, text) {
    const id = `msg-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = `message message-${role}`;
    
    // Parsear pensamientos si existen para mostrarlos como "brain icon"
    const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch) {
        const brain = document.createElement('details');
        brain.className = 'brain-process';
        brain.innerHTML = `<summary><i class="fa-solid fa-brain"></i> Razonamiento</summary><div class="thought-body">${thinkingMatch[1]}</div>`;
        div.appendChild(brain);
    }

    const body = document.createElement('div');
    body.className = 'msg-body';
    body.innerHTML = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').replace(/\n/g, '<br>');
    div.appendChild(body);

    state.ui.messages.appendChild(div);
    state.ui.messages.scrollTop = state.ui.messages.scrollHeight;
    return id;
}

function renderActionCard(container, { type, title, details, btnLabel, onAction }) {
    const card = document.createElement('div');
    card.className = 'action-card animate-slide-up';
    card.innerHTML = `
        <div class="action-icon"><i class="fa-solid ${type === 'web' ? 'fa-globe' : 'fa-file-lines'}"></i></div>
        <div class="action-info">
            <h4>${title}</h4>
            <p>${details}</p>
            <button class="action-btn">${btnLabel}</button>
        </div>
    `;
    card.querySelector('button').onclick = onAction;
    container.appendChild(card);
}

function renderWelcome() {
    const welcome = document.createElement('div');
    welcome.className = 'welcome-screen';
    welcome.innerHTML = `
        <h2>Hola, soy NetRunner</h2>
        <p>Tu ingeniero autónomo personal. ¿Qué vamos a construir hoy?</p>
        <div class="recipe-grid">
            <button class="recipe-btn" data-prompt="Crea una página web personal moderna para un fotógrafo">
                <i class="fa-solid fa-camera"></i>
                <h4>Web de Fotografía</h4>
            </button>
            <button class="recipe-btn" data-prompt="Escribe un informe profesional sobre las tendencias de IA en 2024">
                <i class="fa-solid fa-file-contract"></i>
                <h4>Escribir Informe</h4>
            </button>
        </div>
    `;
    welcome.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
            state.ui.input.value = btn.dataset.prompt;
            state.ui.form.requestSubmit();
        };
    });
    state.ui.messages.appendChild(welcome);
}

function showLoading() {
    const id = `loading-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message message-assistant loading';
    div.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Pensando...';
    state.ui.messages.appendChild(div);
    state.ui.messages.scrollTop = state.ui.messages.scrollHeight;
    return id;
}

function removeLoading(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function showPreview(html) {
    state.ui.modal.classList.remove('hidden');
    state.ui.frame.srcdoc = html;
}

function downloadFile(name, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    a.click();
}
