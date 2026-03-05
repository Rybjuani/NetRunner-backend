/**
 * app-core.js - NetRunner Remote Control v5.0
 * Control total del sistema vía Backend Nativo
 */

const DOM = {
    chat: document.getElementById('chat-messages'),
    form: document.getElementById('chat-form'),
    input: document.getElementById('user-input')
};

const state = {
    history: [],
    processing: false
};

// 1. INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', () => {
    appendSystemMessage("Sistema Nativo Conectado. Acceso total habilitado.");
    setupEvents();
});

function setupEvents() {
    DOM.form.onsubmit = (e) => { e.preventDefault(); submit(); };
    DOM.input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } };
    DOM.input.oninput = () => {
        DOM.input.style.height = 'auto';
        DOM.input.style.height = Math.min(DOM.input.scrollHeight, 200) + 'px';
    };
}

async function submit() {
    if (state.processing) return;
    const text = DOM.input.value.trim();
    if (!text) return;

    appendMessage('user', text);
    DOM.input.value = '';
    DOM.input.style.height = 'auto';

    await executeCommand(text);
}

// 2. CEREBRO (Manda órdenes al servidor)
async function executeCommand(query) {
    state.processing = true;
    const loader = showLoader();

    try {
        // Enviar al servidor (que tiene el prompt de sistema real)
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [...state.history.slice(-10), { role: 'user', content: query }],
                model: CONFIG.DEFAULT_MODEL
            })
        });

        const data = await res.json();
        removeLoader(loader);
        
        // Procesar la respuesta de la IA y ejecutar las acciones NATIVAS
        await processNativeActions(data.text);
        
        state.history.push({ role: 'user', content: query }, { role: 'assistant', content: data.text });

    } catch (e) {
        removeLoader(loader);
        appendMessage('assistant', `Error crítico: ${e.message}`);
    } finally {
        state.processing = false;
    }
}

// 3. EJECUTOR DE ACCIONES NATIVAS
async function processNativeActions(text) {
    const msgId = appendMessage('assistant', text);
    const container = document.getElementById(msgId);

    // [EXEC: comando] - Ejecuta comandos de terminal REALES
    const execRegex = /\[EXEC:\s*(.*?)\]/gi;
    let execMatch;
    while ((execMatch = execRegex.exec(text)) !== null) {
        const cmd = execMatch[1];
        addStatus(container, 'terminal', `Ejecutando: ${cmd}...`, 'warning');
        
        const res = await fetch('/api/system/exec', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd })
        });
        const out = await res.json();
        
        if (out.success) {
            addStatus(container, 'check', 'Comando completado', 'success');
            // Mostrar output si es relevante (opcional, por ahora solo confirmación)
            if (out.output.length > 0 && out.output.length < 500) {
                const pre = document.createElement('pre');
                pre.className = 'terminal-output';
                pre.innerText = out.output;
                container.appendChild(pre);
            }
        } else {
            addStatus(container, 'xmark', `Error: ${out.output}`, 'error');
        }
    }

    // [FILE: ruta]contenido[/FILE] - Escribe archivos REALES
    const fileRegex = /\[FILE:\s*(.*?)\]([\s\S]*?)\[\/FILE\]/gi;
    let fileMatch;
    while ((fileMatch = fileRegex.exec(text)) !== null) {
        const [_, path, content] = fileMatch;
        addStatus(container, 'file-export', `Escribiendo en: ${path}`, 'warning');
        
        const res = await fetch('/api/system/fs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'write', path, content })
        });
        const out = await res.json();
        
        if (out.success) addStatus(container, 'check', 'Archivo guardado en disco', 'success');
        else addStatus(container, 'triangle-exclamation', `Fallo de escritura: ${out.error}`, 'error');
    }
}

// 4. UI COMPONENTS
function appendMessage(role, text) {
    const div = document.createElement('div');
    div.id = `msg-${Date.now()}`;
    div.className = `message message-${role} animate-reveal`;
    
    // Limpiar comandos técnicos del texto visible
    const clean = text.replace(/\[EXEC:.*?\]/gi, '')
                      .replace(/\[FILE:.*?\][\s\S]*?\[\/FILE\]/gi, '')
                      .trim();
    
    div.innerHTML = `<div class="text-content">${clean.replace(/\n/g, '<br>') || 'Procesando sistema...'}</div>`;
    DOM.chat.appendChild(div);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
    return div.id;
}

function addStatus(container, icon, text, type) {
    const div = document.createElement('div');
    div.className = `status-tag status-${type}`;
    div.innerHTML = `<i class="fa-solid fa-${icon}"></i> ${text}`;
    container.appendChild(div);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
}

function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerText = text;
    DOM.chat.appendChild(div);
}

function showLoader() {
    const div = document.createElement('div');
    div.id = 'loader';
    div.className = 'message message-assistant';
    div.innerHTML = '<div class="typing-loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
    DOM.chat.appendChild(div);
    return 'loader';
}

function removeLoader(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}
