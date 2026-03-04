const executionState = {
  isExecuting: false,
  currentExecution: null
};

const PISTON_API = 'https://emkc.org/api/v2/piston';

// Mapeo de lenguajes optimizado con últimas versiones
const LANGUAGE_MAP = new Map([
  ['javascript', { piston: 'javascript', ext: 'js', version: '18.15.0' }],
  ['python', { piston: 'python', ext: 'py', version: '3.10.0' }],
  ['typescript', { piston: 'typescript', ext: 'ts', version: '5.0.3' }],
  ['java', { piston: 'java', ext: 'java', version: '15.0.2' }],
  ['c', { piston: 'c', ext: 'c', version: '10.2.0' }],
  ['cpp', { piston: 'c++', ext: 'cpp', version: '10.2.0' }],
  ['c++', { piston: 'c++', ext: 'cpp', version: '10.2.0' }],
  ['csharp', { piston: 'csharp', ext: 'cs', version: '6.12.0' }],
  ['c#', { piston: 'csharp', ext: 'cs', version: '6.12.0' }],
  ['go', { piston: 'go', ext: 'go', version: '1.16.2' }],
  ['rust', { piston: 'rust', ext: 'rs', version: '1.68.2' }],
  ['ruby', { piston: 'ruby', ext: 'rb', version: '3.0.1' }],
  ['php', { piston: 'php', ext: 'php', version: '8.2.3' }],
  ['swift', { piston: 'swift', ext: 'swift', version: '5.3.3' }],
  ['kotlin', { piston: 'kotlin', ext: 'kt', version: '1.8.20' }],
  ['bash', { piston: 'bash', ext: 'sh', version: '5.2.0' }],
  ['shell', { piston: 'bash', ext: 'sh', version: '5.2.0' }],
  ['powershell', { piston: 'powershell', ext: 'ps1', version: '7.1.4' }],
  ['sql', { piston: 'sqlite3', ext: 'sql', version: '3.36.0' }]
]);

// Límites de seguridad
const EXECUTION_LIMITS = {
  MAX_CODE_LENGTH: 50000, // 50KB
  TIMEOUT: 10000, // 10 segundos
  MAX_OUTPUT_LENGTH: 10000 // 10KB
};

/**
 * Ejecuta código en un lenguaje específico
 * @param {string} code - Código a ejecutar
 * @param {string} language - Lenguaje de programación
 * @param {Array} inputs - Inputs opcionales para stdin
 * @returns {Promise<Object>} Resultado de la ejecución
 */
async function executeCode(code, language, inputs = []) {
  // Validar que no haya otra ejecución en progreso
  if (executionState.isExecuting) {
    return { 
      success: false, 
      error: 'Ya hay una ejecución en progreso. Espera a que termine.' 
    };
  }

  // Validar código
  if (!code || typeof code !== 'string') {
    return { 
      success: false, 
      error: 'Código inválido o vacío' 
    };
  }

  if (code.length > EXECUTION_LIMITS.MAX_CODE_LENGTH) {
    return { 
      success: false, 
      error: `Código demasiado largo. Máximo: ${EXECUTION_LIMITS.MAX_CODE_LENGTH} caracteres` 
    };
  }

  // Normalizar y validar lenguaje
  const normalizedLang = language.toLowerCase().trim();
  const langInfo = LANGUAGE_MAP[normalizedLang];
  
  if (!langInfo) {
    const available = Object.keys(LANGUAGE_MAP).join(', ');
    return { 
      success: false, 
      error: `Lenguaje no soportado: "${language}". Disponibles: ${available}` 
    };
  }

  executionState.isExecuting = true;
  executionState.currentExecution = { language: normalizedLang, startTime: Date.now() };
  
  appendSystemMessage(`⚡ Ejecutando ${normalizedLang}...`);

  try {
    // Crear AbortController para timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXECUTION_LIMITS.TIMEOUT);

    const response = await fetch(PISTON_API + '/execute', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        language: langInfo.piston,
        version: langInfo.version,
        files: [{ 
          name: `main.${langInfo.ext}`,
          content: code 
        }],
        stdin: inputs.join('\n'),
        compile_timeout: 10000,
        run_timeout: 3000,
        compile_memory_limit: -1,
        run_memory_limit: -1
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Sin detalles');
      throw new Error(`API Piston error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const executionTime = Date.now() - executionState.currentExecution.startTime;
    
    executionState.isExecuting = false;
    executionState.currentExecution = null;

    return formatExecutionResult(result, normalizedLang, executionTime);

  } catch (error) {
    executionState.isExecuting = false;
    executionState.currentExecution = null;

    if (error.name === 'AbortError') {
      appendSystemMessage('⏱️ Timeout: La ejecución tardó demasiado (> 10s)');
      return { 
        success: false, 
        error: 'Timeout: La ejecución superó el límite de tiempo',
        timeout: true 
      };
    }

    appendSystemMessage(`❌ Error de ejecución: ${error.message}`);
    return { 
      success: false, 
      error: error.message,
      details: error.toString()
    };
  }
}

/**
 * Formatea el resultado de la ejecución para mostrar al usuario
 */
function formatExecutionResult(result, language, executionTime) {
  const run = result.run || {};
  const compile = result.compile || {};

  let output = '';
  let hasError = false;
  let hasWarning = false;

  // Errores de compilación
  if (compile.stderr) {
    output += '=== COMPILATION ERROR ===\n' + compile.stderr + '\n';
    hasError = true;
  }

  if (compile.stdout) {
    output += '=== COMPILATION OUTPUT ===\n' + compile.stdout + '\n';
  }

  // Errores de ejecución
  if (run.stderr) {
    // Algunos lenguajes usan stderr para warnings, no solo errores
    const isWarning = language === 'python' && !run.code;
    
    if (isWarning) {
      output += '=== WARNINGS ===\n' + run.stderr + '\n';
      hasWarning = true;
    } else {
      output += '=== RUNTIME ERROR ===\n' + run.stderr + '\n';
      hasError = true;
    }
  }

  // Salida estándar
  if (run.stdout) {
    output += run.stdout;
  }

  // Sin salida
  if (!run.stdout && !run.stderr && !compile.stderr && !compile.stdout) {
    output += '(Sin salida - el código se ejecutó pero no produjo output)';
  }

  // Truncar output si es muy largo
  const truncated = output.length > EXECUTION_LIMITS.MAX_OUTPUT_LENGTH;
  if (truncated) {
    output = output.substring(0, EXECUTION_LIMITS.MAX_OUTPUT_LENGTH) + 
             '\n\n... [SALIDA TRUNCADA - DEMASIADO LARGA] ...';
  }

  // Formatear mensaje para el usuario
  let icon = '✅';
  let status = 'Éxito';
  
  if (hasError) {
    icon = '❌';
    status = 'Error';
  } else if (hasWarning) {
    icon = '⚠️';
    status = 'Con advertencias';
  }

  const message = `${icon} ${status} - ${language} (${executionTime}ms)\n\`\`\`\n${output}\n\`\`\``;
  appendSystemMessage(message);

  return {
    success: !hasError,
    output: output,
    language: language,
    exitCode: run.code ?? -1,
    executionTime: executionTime,
    hasWarning: hasWarning,
    truncated: truncated,
    signal: run.signal || null
  };
}

/**
 * Obtiene lista de lenguajes soportados desde Piston API
 */
async function getSupportedLanguages() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(PISTON_API + '/runtimes', {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const runtimes = await response.json();
    
    // Agrupar por lenguaje
    const languageMap = new Map();
    runtimes.forEach(runtime => {
      if (!languageMap.has(runtime.language)) {
        languageMap.set(runtime.language, []);
      }
      languageMap.get(runtime.language).push(runtime.version);
    });

    // Formatear para mostrar
    const formatted = Array.from(languageMap.entries())
      .map(([lang, versions]) => `${lang}: ${versions.join(', ')}`)
      .join('\n');

    return { 
      success: true, 
      runtimes: formatted,
      count: languageMap.size,
      raw: runtimes
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'Timeout al obtener lenguajes' };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Detecta si el texto contiene una acción de ejecución de código
 * @param {string} text - Texto a analizar
 * @returns {Object|null} Objeto de acción o null
 */
function isExecutionAction(text) {
  if (!text || typeof text !== 'string') return null;

  // Patrones mejorados para detectar comandos de ejecución
  const patterns = [
    // JSON con "execute"
    /\{[^}]*"execute"\s*:\s*true[^}]*\}/,
    // JSON con "run"
    /\{[^}]*"run"\s*:\s*true[^}]*\}/,
    // JSON con "language" y "code"
    /\{[^}]*"language"\s*:[^}]*"code"\s*:[^}]*\}/,
    /\{[^}]*"code"\s*:[^}]*"language"\s*:[^}]*\}/,
    // Bloques de código con lenguaje especificado
    /```(\w+)\n([\s\S]*?)```/
  ];

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      try {
        // Intentar parsear JSON
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          // Validar que tenga los campos necesarios
          if ((parsed.execute || parsed.run) && parsed.language && parsed.code) {
            return {
              execute: true,
              language: parsed.language,
              code: parsed.code,
              inputs: parsed.inputs || parsed.stdin || []
            };
          }
          
          if (parsed.language && parsed.code) {
            return {
              execute: true,
              language: parsed.language,
              code: parsed.code,
              inputs: parsed.inputs || []
            };
          }
        }
        
        // Intentar parsear bloque de código markdown
        const codeBlockMatch = text.match(/```(\w+)\n([\s\S]*?)```/);
        if (codeBlockMatch) {
          const [, language, code] = codeBlockMatch;
          
          // Solo ejecutar si el lenguaje es soportado
          if (LANGUAGE_MAP[language.toLowerCase()]) {
            return {
              execute: true,
              language: language.toLowerCase(),
              code: code.trim(),
              inputs: []
            };
          }
        }
      } catch (e) {
        // JSON inválido, continuar con siguiente patrón
        continue;
      }
    }
  }
  
  return null;
}

/**
 * Ejecuta una acción de código desde JSON
 * @param {Object} actionJSON - Objeto con la acción
 * @returns {Promise<Object>} Resultado de la ejecución
 */
async function executeCodeAction(actionJSON) {
  if (!actionJSON || typeof actionJSON !== 'object') {
    return { 
      success: false, 
      error: 'Formato de acción inválido' 
    };
  }

  const language = actionJSON.language || actionJSON.lang || 'javascript';
  const code = actionJSON.code || actionJSON.script || actionJSON.program;
  const inputs = actionJSON.inputs || actionJSON.stdin || [];

  if (!code) {
    return { 
      success: false, 
      error: 'Falta el parámetro "code" para ejecutar' 
    };
  }

  // Validar que inputs sea un array
  const validInputs = Array.isArray(inputs) ? inputs : [inputs.toString()];

  return await executeCode(code, language, validInputs);
}

/**
 * Cancela la ejecución actual (si es posible)
 */
function cancelExecution() {
  if (!executionState.isExecuting) {
    return { success: false, message: 'No hay ejecución en progreso' };
  }

  executionState.isExecuting = false;
  executionState.currentExecution = null;
  
  appendSystemMessage('🛑 Ejecución cancelada por el usuario');
  
  return { success: true, message: 'Ejecución cancelada' };
}

/**
 * Obtiene el estado actual de la ejecución
 */
function getExecutionState() {
  return {
    isExecuting: executionState.isExecuting,
    currentExecution: executionState.currentExecution,
    supportedLanguages: Object.keys(LANGUAGE_MAP)
  };
}

import { writeToTerminal } from './terminal.js';

// --- Overlay de Progreso ---
function showProgressOverlay(msg = 'Instalando dependencias...') {
  let overlay = document.getElementById('progress-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'progress-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(10,10,10,0.85)';
    overlay.style.zIndex = '1000';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    const msgDiv = document.createElement('div');
msgDiv.style.color = '#00f0ff';
msgDiv.style.fontSize = '1.2rem';
msgDiv.style.marginBottom = '16px';
msgDiv.textContent = msg;
const barContainer = document.createElement('div');
barContainer.style.width = '60%';
barContainer.style.height = '18px';
barContainer.style.background = '#222';
barContainer.style.borderRadius = '8px';
barContainer.style.overflow = 'hidden';
const progressBar = document.createElement('div');
progressBar.id = 'progress-bar';
progressBar.style.height = '100%';
progressBar.style.width = '0%';
progressBar.style.background = '#00f0ff';
progressBar.style.transition = 'width 0.4s';
barContainer.appendChild(progressBar);
overlay.appendChild(msgDiv);
overlay.appendChild(barContainer);
    document.getElementById('editor-panel').appendChild(overlay);
  }
}
function hideProgressOverlay() {
  const overlay = document.getElementById('progress-overlay');
  if (overlay) overlay.remove();
}
function setProgressBar(percent) {
  const bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = percent + '%';
}

export async function autoInitializeEnvironment() {
  showProgressOverlay();
  // Simula progreso
  setProgressBar(10);
  await new Promise(r => setTimeout(r, 400));
  setProgressBar(30);
  await runCommand('npm', ['install']);
  setProgressBar(80);
  await new Promise(r => setTimeout(r, 400));
  setProgressBar(100);
  await new Promise(r => setTimeout(r, 300));
  hideProgressOverlay();
}

// --- INTEGRACIÓN BRIDGE LOCAL ---
let bridgeSocket = null;
let bridgeReady = false;

function connectBridge() {
  bridgeSocket = new window.WebSocket('ws://localhost:8080');
  bridgeSocket.onmessage = (event) => {
    if (event.data && typeof event.data === 'string' && event.data.includes('SYSTEM_READY')) {
      bridgeReady = true;
      console.info('[Bridge] Conectado y listo. Operaciones de archivos serán redirigidas al sistema real.');
      appendSystemMessage('🟢 [Bridge] SYSTEM_READY: Operando sobre el sistema real.');
    }
  };
  bridgeSocket.onerror = () => {
    bridgeReady = false;
    bridgeSocket = null;
  };
  bridgeSocket.onclose = () => {
    bridgeReady = false;
    bridgeSocket = null;
  };
}

if (typeof window !== 'undefined') {
  connectBridge();
  window.addEventListener('beforeunload', () => {
    if (window.webContainer && typeof window.webContainer.cleanup === 'function') {
      window.webContainer.cleanup();
    }
  });
}


// --- Ejecución de comandos con piping a xterm.js ---
export async function runCommand(cmd, args = []) {
  // Si Bridge está listo, intenta usarlo primero
  if (bridgeReady) {
    try {
      const res = await bridgeOperationWithFallback({ type: 'executeCommand', cmd, args }, () => runWebContainerCommand(cmd, args));
      if (res && res.output) writeToTerminal(res.output);
      return res;
    } catch (e) {
      writeToTerminal('\x1b[31m[Bridge desconectado, usando entorno virtual]\x1b[0m\r\n');
      return await runWebContainerCommand(cmd, args);
    }
  } else {
    return await runWebContainerCommand(cmd, args);
  }
}

// Ejecuta el comando en WebContainer y envía cada chunk a la terminal
async function runWebContainerCommand(cmd, args = []) {
  if (!window.webContainer) throw new Error('WebContainer no disponible');
  const process = await window.webContainer.spawn(cmd, args);
  const reader = process.output.getReader();
  let output = '';
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    output += text;
    // Pipea chunk a xterm.js, soportando colores ANSI y saltos de línea
    writeToTerminal(text);
  }
  reader.releaseLock();
  return { output };
}

// --- Fallback para operaciones ---
async function bridgeOperationWithFallback(request, fallbackFn) {
  if (bridgeReady && bridgeSocket) {
    appendSystemMessage('🟢 Usando entorno REAL (Bridge) para la operación.');
    return new Promise((resolve) => {
      let responded = false;
      const timeout = setTimeout(() => {
        if (!responded) {
          appendSystemMessage('⚠️ Conexión con el sistema real perdida. Usando entorno virtual.');
          responded = true;
          resolve(fallbackFn());
        }
      }, 5000);
      const handler = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.action === request.action) {
            clearTimeout(timeout);
            bridgeSocket.removeEventListener('message', handler);
            responded = true;
            resolve(data);
          }
        } catch (e) {
          // Si hay error, fallback
          clearTimeout(timeout);
          bridgeSocket.removeEventListener('message', handler);
          responded = true;
          appendSystemMessage('⚠️ Error en el Bridge. Usando entorno virtual.');
          resolve(fallbackFn());
        }
      };
      bridgeSocket.addEventListener('message', handler);
      bridgeSocket.send(JSON.stringify(request));
    });
  } else {
    appendSystemMessage('🟡 Usando entorno VIRTUAL (WebContainer) para la operación.');
    return fallbackFn();
  }
}

// Exportar funciones si estamos en un contexto de módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    executeCode,
    executeCodeAction,
    isExecutionAction,
    getSupportedLanguages,
    cancelExecution,
    getExecutionState,
    LANGUAGE_MAP
  };
}
