/**
 * app-core.js - NetRunner Cloud Edition v5.5
 * Sin errores, robusto y centrado en la web
 */

const DOM = {
    chat: document.getElementById('chat-messages'),
    form: document.getElementById('chat-form'),
    input: document.getElementById('user-input'),
    modelSelect: document.getElementById('model-select')
};

const state = {
    history: [],
    dirHandle: null,
    isProcessing: false,
    currentModel: CONFIG.DEFAULT_MODEL
};

window.addEventListener('DOMContentLoaded', () => {
    populateModels();
    appendSystemMessage("Protocolo NetRunner activo. ¿Qué deseas ejecutar?");
    setupEvents();
});

function populateModels() {
    if (!DOM.modelSelect) return;
    CONFIG.MODELS.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.label;
        DOM.modelSelect.appendChild(option);
    });
    DOM.modelSelect.value = state.currentModel;
    DOM.modelSelect.onchange = (e) => {
        state.currentModel = e.target.value;
        console.log(`Modelo cambiado a: ${state.currentModel}`);
    };
}

function setupEvents() {
    DOM.form.onsubmit = (e) => { e.preventDefault(); handleSubmit(); };
    DOM.input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } };
}

async function handleSubmit() {
    if (state.isProcessing) return;
    const text = DOM.input.value.trim();
    if (!text) return;

    appendMessage('user', text);
    DOM.input.value = '';
    
    await fetchAI(text);
}

async function fetchAI(query) {
    state.isProcessing = true;
    const loaderId = showLoader();

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [...state.history.slice(-10), { role: 'user', content: query }],
                model: state.currentModel
            })
        });

        const data = await res.json();
        removeLoader(loaderId);

        // --- VALIDACIÓN CRÍTICA ---
        if (!data || typeof data.text !== 'string') {
            throw new Error(data.error || "La IA no devolvió una respuesta válida.");
        }

        await processAIResponse(data.text);
        state.history.push({ role: 'user', content: query }, { role: 'assistant', content: data.text });

    } catch (err) {
        removeLoader(loaderId);
        appendMessage('assistant', `⚠️ Fallo de conexión: ${err.message}`);
    } finally {
        state.isProcessing = false;
    }
}

async function processAIResponse(text) {
    // Aseguramos que text sea un string antes de cualquier operación
    const safeText = text || "";
    const msgId = appendMessage('assistant', safeText);
    const container = document.getElementById(msgId);

    // 1. Comando de Permiso Automático
    if (safeText.includes('[REQUEST_PERMISSION]')) {
        renderActionCard(container, 'folder-open', 'Acceso al PC', 'Necesito permiso para gestionar archivos en tu disco.', 'Autorizar Acceso', async () => {
            try {
                state.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                addStatusTag(container, 'check', 'Conexión establecida con el PC', 'success');
            } catch (e) {
                addStatusTag(container, 'xmark', 'Acceso denegado por el navegador', 'error');
            }
        });
    }

    // 2. Comando de Apertura de Web
    const urlMatch = safeText.match(/\[URL:\s*(.*?)\s*\]/);
    if (urlMatch) {
        const url = urlMatch[1];
        renderActionCard(container, 'globe', 'Navegador', `Solicitud para abrir: ${url}`, 'Abrir ahora', () => window.open(url, '_blank'));
    }

    // 3. Comando de Creación de Archivos
    const fileRegex = /\[FILE:\s*([^\]]+)\]([\s\S]*?)\[\/FILE\]/gi;
    let m;
    while ((m = fileRegex.exec(safeText)) !== null) {
        const [_, filename, content] = m;
        if (state.dirHandle) {
            await saveLocalFile(filename.trim(), content, container);
        } else if (!safeText.includes('[REQUEST_PERMISSION]')) {
            // Si la IA no pidió permiso pero intentó crear el archivo, forzamos el botón
            renderActionCard(container, 'lock', 'Archivo Bloqueado', `He preparado "${filename}", pero necesito permiso de disco.`, 'Conectar Carpeta', async () => {
                state.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                await saveLocalFile(filename.trim(), content, container);
            });
        }
    }
}

async function saveLocalFile(name, content, container) {
    try {
        const handle = await state.dirHandle.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        addStatusTag(container, 'file-circle-check', `Guardado en PC: ${name}`, 'success');
    } catch (e) {
        addStatusTag(container, 'triangle-exclamation', `Error de escritura: ${name}`, 'error');
    }
}

// --- UI HELPERS ---
function appendMessage(role, text) {
    const id = `msg-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = `message message-${role} animate-reveal`;
    
    // Limpiar tags técnicos del texto visible (con seguridad null-check)
    const safeText = typeof text === 'string' ? text : "";
    const clean = safeText.replace(/\[FILE:.*?\][\s\S]*?\[\/FILE\]/gi, '')
                          .replace(/\[URL:.*?\]/gi, '')
                          .replace(/\[REQUEST_PERMISSION\]/gi, '')
                          .trim();
    
    div.innerHTML = `<div class="text-content">${clean.replace(/\n/g, '<br>') || 'Procesando comando...'}</div>`;
    DOM.chat.appendChild(div);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
    return id;
}

function renderActionCard(container, icon, title, desc, btn, action) {
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
    card.querySelector('button').onclick = async () => {
        await action();
        card.style.opacity = '0.5';
        card.querySelector('button').disabled = true;
    };
    container.appendChild(card);
}

function addStatusTag(container, icon, text, type) {
    const tag = document.createElement('div');
    tag.className = `status-tag status-${type}`;
    tag.innerHTML = `<i class="fa-solid fa-${icon}"></i> ${text}`;
    container.appendChild(tag);
}

function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerText = text;
    DOM.chat.appendChild(div);
}

function showLoader() {
    const id = `loader-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message message-assistant loading';
    div.innerHTML = '<div class="typing-loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
    DOM.chat.appendChild(div);
    return id;
}

function removeLoader(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}
