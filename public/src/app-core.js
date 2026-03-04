/**
 * app-core.js - NetRunner v4.2 (On-Demand Permissions)
 */

const state = {
    history: [],
    dirHandle: null,
    pendingAction: null, // Almacena la tarea mientras se pide permiso
    ui: {
        chatArea: document.getElementById('chat-messages'),
        inputArea: document.querySelector('.input-area'),
        form: document.getElementById('chat-form'),
        input: document.getElementById('user-input')
    }
};

window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    state.ui.chatArea.innerHTML = '';
    state.ui.inputArea.classList.remove('hidden');
    appendSystemMessage("Asistente listo. ¿En qué puedo ayudarte hoy?");
    
    state.ui.form.onsubmit = handleSubmission;
    
    // Auto-resize
    state.ui.input.oninput = () => {
        state.ui.input.style.height = 'auto';
        state.ui.input.style.height = state.ui.input.scrollHeight + 'px';
    };
}

// --- COMUNICACIÓN ---
async function handleSubmission(e) {
    e.preventDefault();
    const query = state.ui.input.value.trim();
    if (!query) return;

    appendMessage('user', query);
    state.ui.input.value = '';
    state.ui.input.style.height = 'auto';

    const loadingId = showLoading();

    try {
        const sysPrompt = `Eres NetRunner. EJECUTA TAREAS.
        - Si necesitas archivos y NO tienes permiso (actual: ${state.dirHandle ? 'SÍ' : 'NO'}), usa: [REQUEST_PC_PERMISSION]
        - Si necesitas abrir una web, usa: [CONFIRM_URL:https://url.com]
        - Formato ARCHIVOS: [FILE:nombre.ext]contenido[/FILE]`;

        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'system', content: sysPrompt }, ...state.history.slice(-10), { role: 'user', content: query }],
                model: CONFIG.DEFAULT_MODEL
            })
        });

        const data = await res.json();
        removeLoading(loadingId);
        await processAIResponse(data.text);
        
        state.history.push({ role: 'user', content: query }, { role: 'assistant', content: data.text });

    } catch (err) {
        removeLoading(loadingId);
        appendMessage('assistant', `❌ Error: ${err.message}`);
    }
}

// --- MOTOR DE ACCIONES ---
async function processAIResponse(text) {
    const msgId = appendMessage('assistant', text);
    const container = document.getElementById(msgId);

    // 1. ¿La IA pide permiso para el PC?
    if (text.includes('[REQUEST_PC_PERMISSION]')) {
        // Guardar la acción del archivo si venía en el mismo mensaje
        const fileMatch = text.match(/\[FILE:\s*([^\]]+)\]([\s\S]*?)\[\/FILE\]/i);
        if (fileMatch) state.pendingAction = { type: 'file', name: fileMatch[1], content: fileMatch[2] };
        
        renderPermissionCard(container, 'folder-open', 'Acceso al Sistema', 'Necesito permiso para gestionar archivos en tu PC.', 'Conectar Carpeta', async () => {
            try {
                state.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                addStatusTag(container, 'check', 'Permiso concedido', 'success');
                if (state.pendingAction) {
                    await performFileAction(state.pendingAction.name, state.pendingAction.content, container);
                    state.pendingAction = null;
                }
            } catch (e) {
                addStatusTag(container, 'xmark', 'Permiso denegado', 'error');
            }
        });
        return;
    }

    // 2. ¿La IA quiere abrir una URL? (Requiere confirmación para evitar bloqueos)
    const urlMatch = text.match(/\[CONFIRM_URL:\s*(.*?)\s*\]/i);
    if (urlMatch) {
        const url = urlMatch[1];
        renderPermissionCard(container, 'globe', 'Abrir Enlace', `La IA quiere abrir: ${url}`, 'Abrir ahora', () => {
            window.open(url, '_blank');
            addStatusTag(container, 'check', 'Enlace abierto', 'success');
        });
    }

    // 3. Ejecución directa si ya hay permiso
    const fileMatch = text.match(/\[FILE:\s*([^\]]+)\]([\s\S]*?)\[\/FILE\]/gi);
    if (fileMatch && state.dirHandle) {
        // Procesar todos los archivos encontrados
        const fileRegex = /\[FILE:\s*([^\]]+)\]([\s\S]*?)\[\/FILE\]/gi;
        let m;
        while ((m = fileRegex.exec(text)) !== null) {
            await performFileAction(m[1].trim(), m[2], container);
        }
    } else if (fileMatch && !state.dirHandle) {
        // Si hay archivos pero no permiso, y la IA olvidó pedirlo, lo forzamos
        appendMessage('assistant', "Detecto que quieres crear un archivo pero no tengo acceso.");
        // (Llamada recursiva simplificada o disparar el botón de permiso)
    }
}

async function performFileAction(name, content, container) {
    try {
        const fileHandle = await state.dirHandle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        addStatusTag(container, 'file-circle-check', `Archivo guardado: ${name}`, 'success');
    } catch (err) {
        addStatusTag(container, 'triangle-exclamation', `Error al guardar ${name}`, 'error');
    }
}

// --- UI COMPONENTS ---
function renderPermissionCard(container, icon, title, desc, btnLabel, onConfirm) {
    const card = document.createElement('div');
    card.className = 'permission-card animate-slide-up';
    card.innerHTML = `
        <div class="perm-icon"><i class="fa-solid fa-${icon}"></i></div>
        <div class="perm-info">
            <h4>${title}</h4>
            <p>${desc}</p>
            <button class="perm-btn">${btnLabel}</button>
        </div>
    `;
    const btn = card.querySelector('button');
    btn.onclick = () => {
        onConfirm();
        card.style.opacity = '0.5';
        btn.disabled = true;
        btn.innerText = "Procesado";
    };
    container.appendChild(card);
}

function appendMessage(role, text) {
    const id = `msg-${Date.now()}`;
    const div = document.createElement('div');
    div.id = id;
    div.className = `message message-${role} animate-slide-up`;
    
    let cleanText = text.replace(/\[FILE:.*?\][\s\S]*?\[\/FILE\]/gi, '')
                        .replace(/\[CONFIRM_URL:.*?\]/gi, '')
                        .replace(/\[REQUEST_PC_PERMISSION\]/gi, '')
                        .trim();

    if (!cleanText && role === 'assistant') cleanText = "Analizando sistema...";

    div.innerHTML = `<div class="text-content">${cleanText.replace(/\n/g, '<br>')}</div>`;
    state.ui.chatArea.appendChild(div);
    scrollToBottom();
    return id;
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
    state.ui.chatArea.appendChild(div);
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
