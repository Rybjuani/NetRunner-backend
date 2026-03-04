// welcome.js - Mensaje de bienvenida intuitivo y amigable

function getWelcomeMessage() {
  const hour = new Date().getHours();
  let greeting;
  
  if (hour < 12) greeting = '¡Buenos días!';
  else if (hour < 19) greeting = '¡Buenas tardes!';
  else greeting = '¡Buenas noches!';
  
  const messages = [
    `${greeting} Soy NetRunner, tu asistente inteligente 🤖`,
    '',
    '✨ Puedo ayudarte con muchas cosas:',
    '',
    '💬 Conversación natural',
    '   → "¿Cómo funciona el cambio climático?"',
    '   → "Explícame qué es JavaScript"',
    '   → "Dame ideas para una app"',
    '',
    '⚡ Ejecutar código',
    '   → "Ejecuta: print(2 + 2)"',
    '   → "Corre este código Python que calcula factoriales"',
    '',
    '📝 Trabajar con archivos',
    '   → "Crea un archivo notas.txt con mis tareas"',
    '   → "Lee el archivo que te voy a enviar"',
    '',
    '🌐 Ayuda con navegación',
    '   → "Abre YouTube"',
    '   → "Cópiame este texto al portapapeles"',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '💡 Tip: Háblame con naturalidad, no necesitas comandos especiales',
    '',
    '¿En qué puedo ayudarte hoy? 😊'
  ];
  
  return messages.join('\n');
}

function getQuickStartExamples() {
  return [
    {
      emoji: '💭',
      title: 'Conversación',
      example: 'Explícame cómo funciona el Machine Learning',
      description: 'Pregunta lo que quieras'
    },
    {
      emoji: '⚡',
      title: 'Código',
      example: 'Escribe un script Python que ordene una lista',
      description: 'Crea y ejecuta código'
    },
    {
      emoji: '📄',
      title: 'Archivos',
      example: 'Crea un archivo TODO.txt con mis tareas pendientes',
      description: 'Gestiona documentos'
    },
    {
      emoji: '🌐',
      title: 'Navegador',
      example: 'Abre la documentación de Python',
      description: 'Automatiza el navegador'
    }
  ];
}

// Renderizar mensaje de bienvenida en HTML
function renderWelcomeMessage() {
  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'welcome-message';
  welcomeDiv.innerHTML = `
    <div class="welcome-header">
      <h1>👋 ${getGreeting()}</h1>
      <p class="welcome-subtitle">Soy <strong>NetRunner</strong>, tu asistente inteligente</p>
    </div>
    
    <div class="welcome-capabilities">
      <h3>✨ Lo que puedo hacer por ti:</h3>
      
      <div class="capability-grid">
        ${getQuickStartExamples().map(ex => `
          <div class="capability-card" onclick="sendQuickExample('${ex.example.replace(/'/g, "\\'")}')">
            <div class="capability-icon">${ex.emoji}</div>
            <div class="capability-content">
              <h4>${ex.title}</h4>
              <p>${ex.description}</p>
              <div class="capability-example">"${ex.example}"</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <div class="welcome-tip">
      <span class="tip-icon">💡</span>
      <div class="tip-content">
        <strong>Tip importante:</strong> Háblame con naturalidad, como si fuera una persona. 
        No necesitas usar comandos técnicos ni JSON.
      </div>
    </div>
    
    <div class="welcome-footer">
      <p>¿Listo para empezar? Escribe tu pregunta abajo 👇</p>
    </div>
  `;
  
  return welcomeDiv;
}

function getGreeting() {
  const hour = new Date().getHours();
  
  if (hour < 12) return '¡Buenos días!';
  if (hour < 19) return '¡Buenas tardes!';
  return '¡Buenas noches!';
}

// Función para enviar ejemplo rápido
function sendQuickExample(example) {
  const input = document.getElementById('user-input');
  if (input) {
    input.value = example;
    input.focus();
  }
}

// Exportar
if (typeof window !== 'undefined') {
  window.NetRunnerWelcome = {
    getMessage: getWelcomeMessage,
    getExamples: getQuickStartExamples,
    render: renderWelcomeMessage
  };
}

export { getWelcomeMessage, getQuickStartExamples, renderWelcomeMessage };
