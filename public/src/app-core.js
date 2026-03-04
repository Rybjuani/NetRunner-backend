/**
 * app-core.js - NetRunner v4.6 Elite
 * Reparación de Interfaz y Lógica de Envío
 */

const DOM = {
    chat: document.getElementById('chat-messages'),
    form: document.getElementById('chat-form'),
    input: document.getElementById('user-input'),
    status: document.getElementById('status-chip'),
    sendBtn: document.getElementById('send-btn')
};

const state = {
    history: [],
    dirHandle: null,
    isProcessing: false
};

// 1. INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', () => {
    console.log("💎 NetRunner Pro v4.6 cargado");
    renderWelcome();
    setupEvents();
});

function setupEvents() {
    // Envío por formulario
    DOM.form.onsubmit = (e) => {
        e.preventDefault();
        handleAction();
    };

    // Envío por tecla Enter
    DOM.input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAction();
        }
    };

    // Conexión PC
    DOM.status.onclick = async () => {
        try {
            state.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            updateStatusUI(true, 'Sistema Conectado');
            appendMessage('assistant', "✅ Acceso concedido. He vinculado tu carpeta local con mi motor de ejecución.");
        } catch (e) {
            updateStatusUI(false, 'Acceso Denegado');
        }
    };
}

async function handleAction() {
    if (state.isProcessing) return;
    
    const text = DOM.input.value.trim();
    if (!text) return;

    // Limpiar bienvenida
    if (state.history.length === 0) DOM.chat.innerHTML = '';

    appendMessage('user', text);
    DOM.input.value = '';
    DOM.input.style.height = 'auto';

    await fetchAI(text);
}

// 2. MOTOR DE IA
async function fetchAI(query) {
    state.isProcessing = true;
    const loaderId = showLoader();

    const systemPrompt = `Eres NetRunner Pro. EJECUTA directamente.
    FORMATOS: 
    - Archivos: [FILE:nombre.ext]contenido[/FILE]
    - Navegador: [URL:https://sitio.com]
    Permiso PC: ${state.dirHandle ? 'SÍ' : 'NO'}. Si necesitas permiso usa [REQUEST_PC]`;

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'system', content: systemPrompt }, ...state.history.slice(-10), { role: 'user', content: query }],
                model: CONFIG.DEFAULT_MODEL
            })
        });

        const data = await res.json();
        removeLoader(loaderId);
        processAIResponse(data.text);
        
        state.history.push({ role: 'user', content: query }, { role: 'assistant', content: data.text });

    } catch (err) {
        removeLoader(loaderId);
        appendMessage('assistant', `⚠️ Error: ${err.message}`);
    } finally {
        state.isProcessing = false;
    }
}

function processAIResponse(text) {
    const msgId = appendMessage('assistant', text);
    const container = document.getElementById(msgId);

    // Acciones
    if (text.includes('[REQUEST_PC]')) {
        renderCard(container, 'folder-open', 'Permiso Requerido', 'Necesito acceso a tu PC.', 'Vincular Carpeta', () => DOM.status.click());
    }

    const urlMatch = text.match(/\[URL:\s*(.*?)\s*\]/);
    if (urlMatch) {
        renderCard(container, 'globe', 'Navegador', `Abriendo enlace...`, 'Abrir Web', () => window.open(urlMatch[1], '_blank'));
    }

    const fileRegex = /\[FILE:\s*([^\]]+)\]([\s\S]*?)\[\/FILE\]/gi;
    let m;
    while ((m = fileRegex.exec(text)) !== null) {
        const [_, name, content] = m;
        if (state.dirHandle) {
            saveToPC(name.trim(), content, container);
        } else {
            renderCard(container, 'file-arrow-down', 'Archivo Listo', `He preparado "${name}".`, 'Descargar', () => download(name, content));
        }
    }
}

// 3. UI HELPERS
function appendMessage(role, text) {
    const id = `msg-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = `message message-${role}`;
    
    const clean = text.replace(/\[FILE:.*?\][\s\S]*?\[\/FILE\]/gi, '').replace(/\[URL:.*?\]/gi, '').replace(/\[REQUEST_PC\]/gi, '').trim();
    div.innerHTML = `<div class="text-content">${clean.replace(/\n/g, '<br>') || 'Acción procesada.'}</div>`;
    
    DOM.chat.appendChild(div);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
    return id;
}

function renderCard(container, icon, title, desc, btn, action) {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
        <div class="action-icon"><i class="fa-solid fa-${icon}"></i></div>
        <div class="action-info">
            <h4>${title}</h4>
            <p>${desc}</p>
            <button class="action-btn">${btn}</button>
        </div>
    `;
    card.querySelector('button').onclick = action;
    container.appendChild(card);
}

async function saveToPC(name, content, container) {
    try {
        const handle = await state.dirHandle.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        const tag = document.createElement('div');
        tag.style.cssText = "color:var(--success); font-size:0.8rem; margin-top:0.5rem;";
        tag.innerHTML = `<i class="fa-solid fa-check"></i> Archivo guardado: ${name}`;
        container.appendChild(tag);
    } catch (e) {
        console.error(e);
    }
}

function renderWelcome() {
    DOM.chat.innerHTML = `
        <div style="text-align:center; padding: 5rem 1rem;">
            <h1 style="font-size:3rem; font-weight:900; letter-spacing:-2px; margin-bottom:1rem;">NETRUNNER</h1>
            <p style="color:var(--text-dim); font-size:1.2rem; margin-bottom:3rem;">Ingeniería Autónoma de Próxima Generación.</p>
            <button class="status-pill" style="padding:1rem 2rem; font-size:1rem;" onclick="document.getElementById('user-input').value='Crea una web moderna de una sola página'; document.getElementById('chat-form').requestSubmit();">Empezar Proyecto</button>
        </div>
    `;
}

function showLoader() {
    const id = `loader-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message message-assistant';
    div.innerHTML = '<div style="padding:1rem; opacity:0.5;">● ● ●</div>';
    DOM.chat.appendChild(div);
    return id;
}

function removeLoader(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function updateStatusUI(on, label) {
    DOM.status.className = `status-pill ${on ? 'online' : 'offline'}`;
    DOM.status.querySelector('.status-label').textContent = label;
}

function download(n, c) {
    const b = new Blob([c], { type: 'text/plain' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u; a.download = n; a.click();
}
