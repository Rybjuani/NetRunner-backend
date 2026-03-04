// filesystem-simple.js - Gestión de Archivos (Bridge + Browser Fallback)

const FileSystemSimple = {
  bridgeSocket: null,
  bridgeReady: false,
  onStatusChange: null,

  init() {
    this.connectBridge();
    console.log("📂 Sistema de archivos inicializado");
  },

  connectBridge() {
    try {
      this.bridgeSocket = new WebSocket('ws://localhost:8080');
      
      this.bridgeSocket.onopen = () => {
        console.log("🟢 Conexión Bridge establecida");
      };

      this.bridgeSocket.onmessage = (event) => {
        if (event.data.includes('SYSTEM_READY')) {
          this.bridgeReady = true;
          this.updateUI();
        }
      };

      this.bridgeSocket.onerror = () => {
        this.bridgeReady = false;
        this.updateUI();
      };

      this.bridgeSocket.onclose = () => {
        this.bridgeReady = false;
        setTimeout(() => this.connectBridge(), 5000); // Reintentar cada 5s
        this.updateUI();
      };
    } catch (e) {
      console.error("Fallo al conectar Bridge:", e);
    }
  },

  updateUI() {
    if (window.updateStatusDashboard) {
      window.updateStatusDashboard({ 
        bridgeReady: this.bridgeReady, 
        webcontainerReady: true, 
        mode: this.bridgeReady ? 'real' : 'virtual' 
      });
    }
  },

  // Función para que la IA sepa si hay una acción de archivos en su texto
  isAction(text) {
    const fileMatch = text.match(/<file\s+path="([^"]+)">([\s\S]*?)<\/file>/i);
    if (fileMatch) {
      return { type: 'create', path: fileMatch[1], content: fileMatch[2] };
    }
    const readMatch = text.match(/<read\s+path="([^"]+)"\s*\/>/i);
    if (readMatch) {
      return { type: 'read', path: readMatch[1] };
    }
    return null;
  },

  async execute(action) {
    if (action.type === 'create') {
      return this.createFile(action.path, action.content);
    } else if (action.type === 'read') {
      return this.readFile(action.path);
    }
  },

  async createFile(filename, content) {
    if (this.bridgeReady && this.bridgeSocket) {
      return new Promise((resolve) => {
        const msg = JSON.stringify({ action: 'createFile', filename, content });
        this.bridgeSocket.send(msg);
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.action === 'createFile') {
            this.bridgeSocket.removeEventListener('message', handler);
            resolve(data);
          }
        };
        this.bridgeSocket.addEventListener('message', handler);
      });
    }
    // Fallback: Descarga directa si no hay bridge
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    return { success: true, message: "Archivo descargado (Bridge no activo)" };
  },

  async readFile(filename) {
    if (this.bridgeReady && this.bridgeSocket) {
      return new Promise((resolve) => {
        const msg = JSON.stringify({ action: 'readFile', filename });
        this.bridgeSocket.send(msg);
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.action === 'readFile') {
            this.bridgeSocket.removeEventListener('message', handler);
            resolve(data);
          }
        };
        this.bridgeSocket.addEventListener('message', handler);
      });
    }
    return { success: false, message: "Bridge no conectado para lectura" };
  }
};

// Exponer globalmente
window.FileSystemSimple = FileSystemSimple;
FileSystemSimple.init();
