// chat.js - Controlador Principal del Asistente

import { 
  renderThinkingMessages, 
  renderActionCard, 
  updateActionCard, 
  renderSuggestions, 
  updateStatusDashboard, 
  renderWelcomeScreen 
} from './ui.js';

const state = {
  history: [],
  currentModel: CONFIG.DEFAULT_MODEL,
  systemInfo: null,
  technicalPanelOpen: false
};

const elements = {};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  setupUI();
  await detectSystemInfo();
  
  // Limpiar historial si es necesario o cargar bienvenida
  if (state.history.length === 0) {
    elements.messages.innerHTML = '';
    renderWelcomeScreen(elements.messages);
  }

  // Intentar conectar con el Bridge si existe
  if (window.FileSystemSimple) {
    window.FileSystemSimple.updateUI = (status) => {
      updateStatusDashboard(status);
    };
  }
}

function setupUI() {
  elements.modelSelect = document.querySelector('#model-select');
  elements.messages = document.querySelector('#message-list');
  elements.form = document.querySelector('#chat-form');
  elements.input = document.querySelector('#user-input');
  elements.sendBtn = document.querySelector('#send-button');
  elements.techPanel = document.querySelector('#technical-panel');
  elements.toggleTechBtn = document.querySelector('#toggle-technical-panel');

  if (elements.modelSelect) {
    CONFIG.MODELS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id; opt.textContent = m.label;
      elements.modelSelect.appendChild(opt);
    });
    elements.modelSelect.value = state.currentModel;
    elements.modelSelect.onchange = (e) => state.currentModel = e.target.value;
  }

  if (elements.toggleTechBtn) {
    elements.toggleTechBtn.onclick = () => {
      state.technicalPanelOpen = !state.technicalPanelOpen;
      elements.techPanel.style.width = state.technicalPanelOpen ? '500px' : '0';
      elements.toggleTechBtn.classList.toggle('active', state.technicalPanelOpen);
    };
  }

  elements.form.onsubmit = onSubmit;
  
  // Auto-resize textarea
  elements.input.oninput = () => {
    elements.input.style.height = 'auto';
    elements.input.style.height = Math.min(elements.input.scrollHeight, 150) + 'px';
  };

  elements.input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      elements.form.requestSubmit();
    }
  };
}

async function detectSystemInfo() {
  const platform = navigator.platform.toLowerCase();
  let os = 'Windows', osIcon = '🪟';
  if (platform.includes('mac')) { os = 'macOS'; osIcon = '🍎'; }
  else if (platform.includes('linux')) { os = 'Linux'; osIcon = '🐧'; }
  state.systemInfo = { os, osIcon };
}

async function onSubmit(e) {
  e.preventDefault();
  const text = elements.input.value.trim();
  if (!text) return;

  if (state.history.length === 0) elements.messages.innerHTML = '';

  appendMessage('user', text);
  elements.input.value = '';
  elements.input.style.height = 'auto';

  try {
    setLoading(true);
    const response = await sendToAPI(text);
    processResponse(response.text);
  } catch (err) {
    appendMessage('error', 'Error de conexión: ' + err.message);
  } finally {
    setLoading(false);
  }
}

function processResponse(text) {
  appendMessage('assistant', text);
  
  // 1. Detectar Acciones de Archivos
  if (window.FileSystemSimple) {
    const action = window.FileSystemSimple.isAction(text);
    if (action) {
      handleFileSystemAction(action);
    }
  }

  // 2. Sugerencias dinámicas
  const suggestions = [];
  if (text.includes('archivo')) suggestions.push('¿Qué contiene el archivo?', 'Ver en editor');
  if (text.includes('web')) suggestions.push('Abrir vista previa');
  renderSuggestions(elements.messages, suggestions);
}

async function handleFileSystemAction(action) {
  const cardId = renderActionCard(elements.messages, {
    type: 'file',
    title: action.type === 'create' ? 'Creando Archivo' : 'Leyendo Archivo',
    status: 'running',
    details: `Ruta: ${action.path}`
  });

  try {
    const result = await window.FileSystemSimple.execute(action);
    if (result.success) {
      updateActionCard(cardId, {
        status: 'success',
        details: result.message || 'Operación completada.',
        actionLabel: 'Ver en Editor',
        onAction: () => {
          if (window.updateEditorContent) window.updateEditorContent(action.content || result.content);
          elements.toggleTechBtn.click();
        }
      });
    } else {
      updateActionCard(cardId, { status: 'error', details: result.message });
    }
  } catch (err) {
    updateActionCard(cardId, { status: 'error', details: err.message });
  }
}

async function sendToAPI(text) {
  const messages = [...state.history, { role: 'user', content: text }];
  const res = await fetch(CONFIG.API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model: state.currentModel })
  });
  const data = await res.json();
  state.history.push({ role: 'user', content: text }, { role: 'assistant', content: data.text });
  return data;
}

function appendMessage(role, text) {
  const msg = document.createElement('div');
  msg.className = `message message-${role} animate-slide-up`;
  const body = document.createElement('div');
  body.className = 'message-body';

  if (role === 'assistant') {
    renderThinkingMessages(body, text);
  } else if (role === 'error') {
    body.innerHTML = `<span style="color:#ff3366;"><i class="fa-solid fa-circle-exclamation"></i> ${text}</span>`;
  } else {
    body.innerHTML = text.replace(/\n/g, '<br>');
  }

  msg.appendChild(body);
  elements.messages.appendChild(msg);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function setLoading(isLoading) {
  elements.sendBtn.disabled = isLoading;
  elements.input.disabled = isLoading;
  if (isLoading) {
    const loader = document.createElement('div');
    loader.id = 'typing-loader';
    loader.className = 'message message-assistant opacity-50';
    loader.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    elements.messages.appendChild(loader);
  } else {
    const loader = document.querySelector('#typing-loader');
    if (loader) loader.remove();
  }
}

function qs(sel) { return document.querySelector(sel); }
