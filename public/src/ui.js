// ui.js - Interfaz y Componentes Visuales

// Exponer funciones críticas al objeto global window para scripts no-módulos
export function updateStatusDashboard({ bridgeReady, webcontainerReady, mode }) {
  const ledBridge = document.getElementById('led-bridge');
  const ledWebContainer = document.getElementById('led-webcontainer');
  const retryBtn = document.getElementById('retry-bridge-btn');

  if (ledBridge) {
    ledBridge.style.background = bridgeReady ? '#2dff4d' : '#ff2d2d';
    ledBridge.style.boxShadow = bridgeReady ? '0 0 10px #2dff4d' : '0 0 5px #ff2d2d';
  }
  
  if (ledWebContainer) {
    ledWebContainer.style.background = webcontainerReady ? '#2dff4d' : '#ff2d2d';
  }

  if (retryBtn) {
    retryBtn.style.display = bridgeReady ? 'none' : 'inline-block';
  }
}

export function renderThinkingMessages(container, text) {
  const thinkingMatches = text.match(/<thinking>([\s\S]*?)<\/thinking>/g);
  let mainText = text;

  if (thinkingMatches) {
    thinkingMatches.forEach(match => {
      const content = match.replace(/<\/?thinking>/g, '').trim();
      const details = document.createElement('details');
      details.className = 'ai-thought-process mb-4 opacity-70';
      
      const summary = document.createElement('summary');
      summary.className = 'text-xs cursor-pointer text-gray-400 italic flex items-center gap-2 outline-none';
      summary.innerHTML = '<i class="fa-solid fa-brain"></i> Analizando tarea...';
      
      const body = document.createElement('div');
      body.className = 'pl-4 border-l-2 border-gray-800 mt-2 text-sm text-gray-500';
      body.textContent = content;
      
      details.appendChild(summary);
      details.appendChild(body);
      container.appendChild(details);
      mainText = mainText.replace(match, '');
    });
  }

  const mainDiv = document.createElement('div');
  mainDiv.className = 'message-content';
  mainDiv.innerHTML = mainText.replace(/\n/g, '<br>');
  container.appendChild(mainDiv);
}

export function renderWelcomeScreen(container) {
  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'welcome-screen max-w-2xl mx-auto py-12 px-6 animate-slide-up';
  
  welcomeDiv.innerHTML = `
    <div class="text-center mb-10">
      <h2 class="text-3xl font-bold mb-2 text-white">¿En qué puedo ayudarte?</h2>
      <p class="text-gray-400">Selecciona una tarea rápida o escribe lo que necesites.</p>
    </div>
    
    <div class="welcome-grid">
      <div class="recipe-card" data-prompt="Crea una página web personal sencilla con mi nombre">
        <i class="fa-solid fa-code"></i>
        <h4>Crear Web</h4>
        <p>Genera un portfolio en segundos.</p>
      </div>
      <div class="recipe-card" data-prompt="¿Qué archivos tengo en la carpeta actual?">
        <i class="fa-solid fa-folder-tree"></i>
        <h4>Ver Archivos</h4>
        <p>Explora tu sistema actual.</p>
      </div>
    </div>
  `;

  welcomeDiv.querySelectorAll('.recipe-card').forEach(card => {
    card.onclick = () => {
      const input = document.getElementById('user-input');
      const form = document.getElementById('chat-form');
      input.value = card.dataset.prompt;
      form.requestSubmit();
    };
  });
  
  container.appendChild(welcomeDiv);
}

export function renderSuggestions(container, suggestions) {
  if (!suggestions || suggestions.length === 0) return;
  const div = document.createElement('div');
  div.className = 'suggestions-container flex flex-wrap gap-2 mt-4';
  suggestions.forEach(text => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-btn';
    btn.textContent = text;
    btn.onclick = () => {
      document.getElementById('user-input').value = text;
      document.getElementById('chat-form').requestSubmit();
      div.remove();
    };
    div.appendChild(btn);
  });
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

export function renderActionCard(container, { type, title, status, details, actionLabel, onAction }) {
  const cardId = `card-${Date.now()}`;
  const card = document.createElement('div');
  card.id = cardId;
  card.className = 'action-card p-4 rounded-lg bg-gray-900 border border-gray-800 my-4 flex items-start gap-4 shadow-xl';
  
  const icon = status === 'running' ? 'fa-spinner fa-spin' : (type === 'file' ? 'fa-file-code' : 'fa-bolt');
  const color = status === 'success' ? 'text-green-400' : (status === 'error' ? 'text-red-400' : 'text-blue-400');
  
  card.innerHTML = `
    <div class="card-icon ${color} text-xl mt-1"><i class="fa-solid ${icon}"></i></div>
    <div class="card-content flex-1">
      <h4 class="font-bold text-sm text-gray-200">${title}</h4>
      <p class="text-xs text-gray-500 mt-1">${details || ''}</p>
    </div>
  `;
  
  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.className = 'mt-3 px-3 py-1 bg-gray-800 text-xs rounded hover:bg-gray-700';
    btn.textContent = actionLabel;
    btn.onclick = onAction;
    card.querySelector('.card-content').appendChild(btn);
  }
  
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
  return cardId;
}

export function updateActionCard(cardId, { status, details, actionLabel, onAction }) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const iconContainer = card.querySelector('.card-icon');
  const detailsText = card.querySelector('p');

  if (status === 'success') {
    iconContainer.className = 'card-icon text-green-400 text-xl mt-1';
    iconContainer.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
  } else if (status === 'error') {
    iconContainer.className = 'card-icon text-red-400 text-xl mt-1';
    iconContainer.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
  }
  if (details) detailsText.textContent = details;

  if (actionLabel && onAction && !card.querySelector('button')) {
    const btn = document.createElement('button');
    btn.className = 'mt-3 px-3 py-1 bg-gray-800 text-xs rounded hover:bg-gray-700';
    btn.textContent = actionLabel;
    btn.onclick = onAction;
    card.querySelector('.card-content').appendChild(btn);
  }
}

// Registro global para scripts no-módulos
window.updateStatusDashboard = updateStatusDashboard;
window.renderActionCard = renderActionCard;
window.updateActionCard = updateActionCard;
