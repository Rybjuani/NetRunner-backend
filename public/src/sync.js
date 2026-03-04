import { updateEditorContent } from './editor.js';
// Suponiendo que bridge y webContainer están disponibles globalmente
let debounceTimeout = null;
let lastContent = '';

export function notifyFileChange(filePath, content) {
  lastContent = content;
  if (debounceTimeout) clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    // Prioridad: Editor Monaco primero
    updateEditorContent(lastContent);
    // Luego Bridge o WebContainer
    if (window.bridgeReady && window.bridge && typeof window.bridge.writeFile === 'function') {
      window.bridge.writeFile(filePath, lastContent);
    } else if (window.webcontainerInstance && typeof window.webcontainerInstance.writeFile === 'function') {
      window.webcontainerInstance.writeFile(filePath, lastContent);
    }
  }, 300);
}
// Ejemplo de integración con IA
function cleanupListeners() {
  window.removeEventListener('fileWritten', fileWrittenHandler);
  window.removeEventListener('DOMContentLoaded', domLoadedHandler);
}

function fileWrittenHandler(e) {
  const { filePath, content } = e.detail;
  notifyFileChange(filePath, content);
  import('./editor.js').then(({ updateEditorContent }) => {
    updateEditorContent(content);
  });
}

function domLoadedHandler() {
  // ...resto de lógica de inicialización...
}

window.addEventListener('fileWritten', fileWrittenHandler);
window.addEventListener('beforeunload', cleanupListeners);


// --- ZIP Download ---
import JSZip from './jszip.min.js';

export async function downloadProjectZip() {
  const zip = new JSZip();
  let files = [];
  if (window.bridgeReady) {
    // Solicita lista de archivos al Bridge
    files = await window.bridge.listFilesRecursively(); // Debe devolver [{path, content}]
  } else if (window.webcontainerInstance) {
    // Recursivo en WebContainer
    files = await window.webcontainerInstance.listFilesRecursively(); // Debe devolver [{path, content}]
  }
  files.forEach(f => zip.file(f.path, f.content));
  const blob = await zip.generateAsync({type:'blob'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'NetRunnerProject.zip';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, 1000);
}

// --- Persistencia de sesión ---
function saveSessionState({ openFiles, mode }) {
  localStorage.setItem('netrunner_openFiles', JSON.stringify(openFiles || []));
  localStorage.setItem('netrunner_mode', mode || 'virtual');
}
function loadSessionState() {
  let openFiles = [];
try {
  openFiles = JSON.parse(localStorage.getItem('netrunner_openFiles') || '[]');
} catch(e) {
  openFiles = [];
}
  const mode = localStorage.getItem('netrunner_mode') || 'virtual';
  return { openFiles, mode };
}

// Vincular botones UI
let monacoReady = false;
window.addEventListener('DOMContentLoaded', domLoadedHandler);
  // Restaurar sesión
  const { openFiles, mode } = loadSessionState();
  if (mode && document.getElementById('mode-selector')) {
    document.getElementById('mode-selector').value = mode;
    window.currentMode = mode;
  }
  if (openFiles && openFiles.length && window.editor) {
    // Espera a que Monaco esté listo antes de abrir archivos
    const tryOpenFiles = () => {
      if (window.editor && typeof window.editor.openFile === 'function') {
        openFiles.forEach(f => window.editor.openFile(f));
        monacoReady = true;
      } else {
        setTimeout(tryOpenFiles, 100);
      }
    };
    tryOpenFiles();
  }

  const btn = document.getElementById('download-zip-btn');
  if (btn) btn.onclick = downloadProjectZip;

  // Preview panel toggle
  const previewPanel = document.getElementById('preview-panel');
  const previewBtn = document.getElementById('toggle-preview-btn');
  if (previewPanel && previewBtn) {
    previewBtn.onclick = () => {
      if (previewPanel.style.display === 'none') {
        previewPanel.style.display = 'flex';
        previewBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
      } else {
        previewPanel.style.display = 'none';
        previewBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
      }
    };
  }
});
