/**
 * app-core.js - NetRunner v4.7 Ultra-Clean
 */

const state = {
    history: [],
    dirHandle: null,
    isProcessing: false
};

const DOM = {
    chat: document.getElementById('chat-messages'),
    form: document.getElementById('chat-form'),
    input: document.getElementById('user-input')
};

// 1. INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', () => {
    appendSystemMessage("NetRunner listo. Escribe una orden para comenzar.");
    setupEvents();
});

function setupEvents() {
    DOM.form.onsubmit = (e) => {
        e.preventDefault();
        handleUserAction();
    };

    DOM.input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUserAction();
        }
    };

    // Auto-ajuste de altura
    DOM.input.oninput = () => {
        DOM.input.style.height = 'auto';
        DOM.input.style.height = Math.min(DOM.input.scrollHeight, 200) + 'px';
    };
}

async function handleUserAction() {
    if (state.isProcessing) return;
    const text = DOM.input.value.trim();
    if (!text) return;

    appendMessage('user', text);
    DOM.input.value = '';
    DOM.input.style.height = 'auto';

    await fetchAI(text);
}

// 2. MOTOR DE IA
async function fetchAI(query) {
    state.isProcessing = true;
    const loaderId = showLoader();

    // Prompt reforzado para que ACTUE y pida permisos
    const systemPrompt = `Eres NetRunner. EJECUTA TAREAS.
    - Si necesitas crear un archivo y no tienes permiso (dir: ${state.dirHandle ? 'OK' : 'SIN PERMISO'}), usa [REQUEST_PC].
    - Para ARCHIVOS: [FILE:nombre.ext]contenido[/FILE]
    - Para WEBS: [URL:https://sitio.com]
    No des explicaciones técnicas. Solo confirma la acción.`;

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

        if (!res.ok) throw new Error("Error en el servidor de chat.");
        const data = await res.json();
        
        removeLoader(loaderId);
        processActions(data.text);
        
        state.history.push({ role: 'user', content: query }, { role: 'assistant', content: data.text });

    } catch (err) {
        removeLoader(loaderId);
        appendMessage('assistant', `⚠️ Error: No pude procesar tu petición. ${err.message}`);
    } finally {
        state.isProcessing = false;
    }
}

function processActions(text) {
    const msgId = appendMessage('assistant', text);
    const container = document.getElementById(msgId);

    // Acción: Pedir permiso PC
    if (text.includes('[REQUEST_PC]')) {
        renderCard(container, 'folder-open', 'Acceso al Disco', 'Necesito permiso para guardar archivos en tu PC.', 'Seleccionar Carpeta', async () => {
            try {
                // Forzamos la sugerencia de empezar en el escritorio para mayor éxito
                state.dirHandle = await window.showDirectoryPicker({ 
                    mode: 'readwrite',
                    startIn: 'desktop' 
                });
                addStatus(container, 'check', 'PC Vinculado correctamente.', 'success');
            } catch (e) {
                if (e.name === 'SecurityError') {
                    addStatus(container, 'triangle-exclamation', 'Carpeta Prohibida: Por seguridad, elige una carpeta personal como "Escritorio" o "Documentos", no una del sistema (C:\\).', 'error');
                } else if (e.name === 'AbortError') {
                    addStatus(container, 'circle-info', 'Selección cancelada.', 'warning');
                } else {
                    addStatus(container, 'circle-exclamation', 'Error inesperado: ' + e.message, 'error');
                }
            }
        });
    }

    // Acción: Abrir URL
    const urlMatch = text.match(/\[URL:\s*(.*?)\s*\]/i);
    if (urlMatch) {
        renderCard(container, 'globe', 'Navegador', `¿Quieres abrir ${urlMatch[1]}?`, 'Abrir Web', () => window.open(urlMatch[1], '_blank'));
    }

    // Acción: Crear Archivo
    const fileRegex = /\[FILE:\s*([^\]]+)\]([\s\S]*?)\[\/FILE\]/gi;
    let m;
    while ((m = fileRegex.exec(text)) !== null) {
        const [_, name, content] = m;
        if (state.dirHandle) {
            saveFile(name.trim(), content, container);
        } else if (!text.includes('[REQUEST_PC]')) {
            // Si la IA olvidó pedir permiso, lo forzamos
            renderCard(container, 'file-circle-exclamation', 'Permiso faltante', `He preparado "${name}", pero no tengo acceso al disco.`, 'Vincular ahora', async () => {
                state.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                saveFile(name.trim(), content, container);
            });
        }
    }
}

// 3. UTILIDADES
async function saveFile(name, content, container) {
    try {
        const handle = await state.dirHandle.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        addStatus(container, 'file-circle-check', `Archivo guardado: ${name}`, 'success');
    } catch (e) {
        addStatus(container, 'triangle-exclamation', `No pude escribir en esta carpeta del sistema.`, 'error');
    }
}

function appendMessage(role, text) {
    const id = `msg-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = `message message-${role}`;
    
    const clean = text.replace(/\[FILE:.*?\][\s\S]*?\[\/FILE\]/gi, '').replace(/\[URL:.*?\]/gi, '').replace(/\[REQUEST_PC\]/gi, '').trim();
    div.innerHTML = `<div class="text-content">${clean.replace(/\n/g, '<br>') || 'Hecho.'}</div>`;
    
    DOM.chat.appendChild(div);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
    return id;
}

function renderCard(container, icon, title, desc, btn, action) {
    const card = document.createElement('div');
    card.className = 'action-card animate-reveal';
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

function addStatus(container, icon, text, type) {
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
    div.className = 'message message-assistant';
    div.innerHTML = '<div class="typing-loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
    DOM.chat.appendChild(div);
    return id;
}

function removeLoader(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}
