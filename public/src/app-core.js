/**
 * app-core.js - NetRunner v4.5 Master Edition
 * Robustez Total y UI de Alta Gama
 */

const DOM = {
    chat: document.getElementById('chat-messages'),
    form: document.getElementById('chat-form'),
    input: document.getElementById('user-input'),
    status: document.getElementById('status-chip')
};

const state = {
    history: [],
    dirHandle: null,
    isProcessing: false
};

// 1. INICIO
window.addEventListener('DOMContentLoaded', () => {
    renderWelcome();
    setupEventListeners();
    checkCapabilities();
});

function checkCapabilities() {
    if (!('showDirectoryPicker' in window)) {
        updateStatusUI(false, 'Incompatible');
    }
}

function setupEventListeners() {
    // Manejo de envío
    DOM.form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSubmit();
    });

    // Tecla Enter (con soporte para Shift+Enter para saltos de línea)
    DOM.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });

    // Auto-ajuste de altura del input
    DOM.input.addEventListener('input', () => {
        DOM.input.style.height = 'auto';
        DOM.input.style.height = Math.min(DOM.input.scrollHeight, 200) + 'px';
    });

    // Click en el estado para conectar PC
    DOM.status.onclick = async () => {
        try {
            state.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            updateStatusUI(true, 'PC Conectado');
            appendMessage('assistant', "✅ He establecido una conexión segura con tu carpeta local. Ya puedo actuar sobre tus archivos directamente.");
        } catch (e) {
            updateStatusUI(false, 'Acceso Denegado');
        }
    };
}

// 2. LOGICA DE ENVÍO
async function handleSubmit() {
    if (state.isProcessing) return;
    
    const query = DOM.input.value.trim();
    if (!query) return;

    // Limpiar UI si es el primer mensaje
    if (state.history.length === 0) DOM.chat.innerHTML = '';

    appendMessage('user', query);
    DOM.input.value = '';
    DOM.input.style.height = 'auto';

    await getAIResponse(query);
}

async function getAIResponse(query) {
    state.isProcessing = true;
    const loaderId = showLoader();

    const systemPrompt = `Eres NetRunner Pro, un asistente de ingeniería de élite.
    ACCIONES DISPONIBLES:
    - Para ARCHIVOS: [FILE:nombre.ext]contenido[/FILE]
    - Para WEBS: [URL:https://sitio.com]
    
    INSTRUCCIONES:
    - Si el usuario pide crear algo y no tienes permiso (dirHandle: ${state.dirHandle ? 'SÍ' : 'NO'}), pídelo con [REQUEST_PC].
    - Nunca des pasos de tutorial. EJECUTA.`;

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...state.history.slice(-10),
                    { role: 'user', content: query }
                ],
                model: CONFIG.DEFAULT_MODEL
            })
        });

        const data = await res.json();
        removeLoader(loaderId);
        
        processActions(data.text);
        
        state.history.push({ role: 'user', content: query });
        state.history.push({ role: 'assistant', content: data.text });

    } catch (err) {
        removeLoader(loaderId);
        appendMessage('assistant', `⚠️ Error de conexión: ${err.message}`);
    } finally {
        state.isProcessing = false;
    }
}

// 3. PROCESADOR DE ACCIONES
async function processActions(text) {
    const msgId = appendMessage('assistant', text);
    const container = document.getElementById(msgId);

    // Permiso PC
    if (text.includes('[REQUEST_PC]')) {
        renderActionCard(container, 'folder-open', 'Acceso al Sistema', 'Necesito permiso para gestionar archivos.', 'Conectar PC', () => DOM.status.click());
    }

    // URL
    const urlMatch = text.match(/\[URL:\s*(.*?)\s*\]/);
    if (urlMatch) {
        renderActionCard(container, 'globe', 'Navegador', `Solicitud para abrir: ${urlMatch[1]}`, 'Abrir Web', () => window.open(urlMatch[1], '_blank'));
    }

    // Archivos
    const fileRegex = /\[FILE:\s*([^\]]+)\]([\s\S]*?)\[\/FILE\]/gi;
    let match;
    while ((match = fileRegex.exec(text)) !== null) {
        const [_, name, content] = match;
        if (state.dirHandle) {
            await saveFile(name.trim(), content, container);
        } else {
            renderActionCard(container, 'download', 'Archivo Pendiente', `He preparado "${name}", pero necesito permiso.`, 'Descargar ahora', () => downloadFallback(name, content));
        }
    }
}

async function saveFile(name, content, container) {
    try {
        const handle = await state.dirHandle.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        addStatusTag(container, 'check-circle', `Archivo guardado: ${name}`, 'success');
    } catch (e) {
        addStatusTag(container, 'exclamation-circle', `Error al guardar: ${name}`, 'error');
    }
}

// 4. UI ENGINE
function appendMessage(role, text) {
    const id = `msg-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = `message message-${role}`;
    
    const cleanText = text.replace(/\[FILE:.*?\][\s\S]*?\[\/FILE\]/gi, '')
                          .replace(/\[URL:.*?\]/gi, '')
                          .replace(/\[REQUEST_PC\]/gi, '')
                          .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                          .trim();

    div.innerHTML = `<div class="text-content">${cleanText.replace(/\n/g, '<br>') || 'He procesado la acción.'}</div>`;
    DOM.chat.appendChild(div);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
    return id;
}

function renderActionCard(container, icon, title, desc, btnLabel, onAction) {
    const card = document.createElement('div');
    card.className = 'action-card animate-reveal';
    card.innerHTML = `
        <div class="action-icon"><i class="fa-solid fa-${icon}"></i></div>
        <div class="action-info">
            <h4>${title}</h4>
            <p>${desc}</p>
            <button class="action-btn">${btnLabel}</button>
        </div>
    `;
    card.querySelector('button').onclick = onAction;
    container.appendChild(card);
}

function addStatusTag(container, icon, text, type) {
    const tag = document.createElement('div');
    tag.style.cssText = `font-size: 0.75rem; color: var(--${type === 'success' ? 'success' : 'error'}); margin-top: 0.5rem; display: flex; align-items: center; gap: 0.5rem;`;
    tag.innerHTML = `<i class="fa-solid fa-${icon}"></i> ${text}`;
    container.appendChild(tag);
}

function renderWelcome() {
    DOM.chat.innerHTML = `
        <div class="message message-assistant" style="max-width: 100%; text-align: center; padding: 4rem 0;">
            <h2 style="font-size: 2.5rem; font-weight: 800; margin-bottom: 1rem; background: linear-gradient(to bottom, #fff, #666); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">NetRunner Pro</h2>
            <p style="color: var(--text-dim); font-size: 1.1rem; max-width: 500px; margin: 0 auto 2rem;">Asistente autónomo de ingeniería. Capaz de gestionar archivos locales y automatizar flujos web.</p>
            <div style="display: flex; justify-content: center; gap: 1rem;">
                <button class="status-pill" style="padding: 0.8rem 1.5rem; font-size: 0.8rem;" onclick="document.getElementById('user-input').value='Crea una landing page moderna en un archivo index.html'; document.getElementById('chat-form').requestSubmit();">Crear Web</button>
                <button class="status-pill" style="padding: 0.8rem 1.5rem; font-size: 0.8rem;" onclick="document.getElementById('user-input').value='Abre youtube'; document.getElementById('chat-form').requestSubmit();">Abrir App</button>
            </div>
        </div>
    `;
}

function showLoader() {
    const id = `loader-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message message-assistant';
    div.innerHTML = '<div class="typing-loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
    DOM.chat.appendChild(div);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
    return id;
}

function removeLoader(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function updateStatusUI(online, label) {
    DOM.status.className = `status-pill ${online ? 'online' : 'offline'}`;
    DOM.status.querySelector('.status-label').textContent = label || 'PC Local';
}

function downloadFallback(name, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
}
