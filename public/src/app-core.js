// app-core.js - Implementación Directa (Sin Bridge)

const state = {
    history: [],
    dirHandle: null, // Acceso directo al disco
    ui: {
        messages: document.getElementById('chat-messages'),
        input: document.getElementById('user-input'),
        form: document.getElementById('chat-form'),
        status: document.getElementById('bridge-status')
    }
};

// 1. INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', () => {
    renderWelcome();
    setupEvents();
    checkCapabilities();
});

function checkCapabilities() {
    const isSupported = 'showDirectoryPicker' in window;
    updateStatusUI(false, isSupported ? 'Listo para conectar' : 'Navegador no compatible');
}

function setupEvents() {
    state.ui.form.onsubmit = async (e) => {
        e.preventDefault();
        const text = state.ui.input.value.trim();
        if (!text) return;
        if (state.history.length === 0) state.ui.messages.innerHTML = '';
        appendMessage('user', text);
        state.ui.input.value = '';
        await sendMessage(text);
    };

    // Botón de conexión directa al PC
    state.ui.status.onclick = async () => {
        try {
            state.dirHandle = await window.showDirectoryPicker();
            updateStatusUI(true, 'PC Conectado (Escritorio)');
            appendMessage('assistant', "✅ ¡Excelente! Ya tengo acceso directo a tu carpeta. Ahora puedo crear y leer archivos allí mismo.");
        } catch (e) {
            console.error(e);
            updateStatusUI(false, 'Acceso denegado');
        }
    };
}

function updateStatusUI(online, text) {
    const pill = state.ui.status;
    pill.className = `status-pill ${online ? 'online' : 'offline'}`;
    pill.querySelector('.label').textContent = text;
}

// 2. COMUNICACIÓN Y ACCIÓN DIRECTA
async function sendMessage(text) {
    const loadingId = showLoading();
    
    const systemPrompt = `Eres NetRunner, un asistente que ACTÚA. 
    ${state.dirHandle ? 'TIENES ACCESO DIRECTO AL DISCO.' : 'Pide al usuario que pulse el botón PC Local para acceder al disco.'}
    
    COMANDOS QUE DEBES USAR (Escríbelos tal cual):
    - CREAR ARCHIVO: [FILE:nombre.txt]CONTENIDO[/FILE]
    - ABRIR WEB: [URL:https://youtube.com]
    
    Ejemplo: Si te piden abrir youtube y crear un archivo, responde:
    "Claro, marchando. [URL:https://youtube.com] [FILE:hola.txt]Hola Mundo[/FILE]"`;

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
        
        processAIResponse(data.text);
        state.history.push({ role: 'user', content: text }, { role: 'assistant', content: data.text });

    } catch (error) {
        removeLoading(loadingId);
        appendMessage('assistant', '⚠️ Error de conexión con la IA.');
    }
}

async function processAIResponse(text) {
    const msgId = appendMessage('assistant', text);
    const container = document.getElementById(msgId);

    // 1. Ejecutar Apertura de URL
    const urlMatch = text.match(/\[URL:(.*?)\]/);
    if (urlMatch) {
        const url = urlMatch[1];
        window.open(url, '_blank');
        renderActionCard(container, 'globe', 'Navegador', `Abriendo ${url}`, 'success');
    }

    // 2. Ejecutar Creación de Archivo Directa
    const fileMatch = text.match(/\[FILE:(.*?)\]([\s\S]*?)\[\/FILE\]/);
    if (fileMatch) {
        const [_, filename, content] = fileMatch;
        
        if (state.dirHandle) {
            try {
                const fileHandle = await state.dirHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(content);
                await writable.close();
                renderActionCard(container, 'file-circle-check', 'Archivo Guardado', `Creado ${filename} en tu carpeta.`, 'success');
            } catch (e) {
                renderActionCard(container, 'circle-exclamation', 'Error de Disco', e.message, 'error');
            }
        } else {
            renderActionCard(container, 'lock', 'Acceso Denegado', 'Pulsa el botón "PC Local" arriba para darme permiso.', 'error');
        }
    }
}

// 3. UI HELPERS
function appendMessage(role, text) {
    const id = `msg-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = `message message-${role} animate-slide-up`;
    
    // Limpiar comandos del texto visible para el usuario
    let cleanText = text.replace(/\[FILE:.*?\][\s\S]*?\[\/FILE\]/g, '')
                        .replace(/\[URL:.*?\]/g, '')
                        .trim();
    
    if (!cleanText && role === 'assistant') cleanText = "¡Hecho! He procesado tu solicitud.";

    div.innerHTML = cleanText.replace(/\n/g, '<br>');
    state.ui.messages.appendChild(div);
    state.ui.messages.scrollTop = state.ui.messages.scrollHeight;
    return id;
}

function renderActionCard(container, icon, title, details, status) {
    const card = document.createElement('div');
    card.className = `action-card status-${status} animate-slide-up`;
    card.innerHTML = `
        <div class="action-icon"><i class="fa-solid fa-${icon}"></i></div>
        <div class="action-info">
            <h4>${title}</h4>
            <p>${details}</p>
        </div>
    `;
    container.appendChild(card);
}

function showLoading() {
    const id = `load-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message message-assistant loading';
    div.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Trabajando...';
    state.ui.messages.appendChild(div);
    return id;
}

function removeLoading(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function renderWelcome() {
    state.ui.messages.innerHTML = `
        <div class="welcome-screen">
            <h2>Hola, soy NetRunner</h2>
            <p>Para empezar, haz clic en el botón <b>"PC Local"</b> de arriba para elegir dónde quieres que trabaje.</p>
            <div class="recipe-grid">
                <button onclick="document.getElementById('user-input').value='Abre youtube y crea un saludo.txt'; document.getElementById('chat-form').requestSubmit();" class="recipe-btn">
                    <i class="fa-solid fa-bolt"></i>
                    <h4>Acción Directa</h4>
                </button>
            </div>
        </div>
    `;
}
