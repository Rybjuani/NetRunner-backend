const browserAutomation = {
  
  clipboard: {
    /**
     * Copia texto al portapapeles
     */
    async copy(text) {
      if (!text || typeof text !== 'string') {
        appendSystemMessage('⚠️ Error: Texto inválido para copiar');
        return { success: false, error: 'Invalid text' };
      }

      // Verificar soporte de API
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        appendSystemMessage('⚠️ API de portapapeles no soportada en este navegador');
        return { success: false, error: 'Clipboard API not supported' };
      }

      try {
        await navigator.clipboard.writeText(text);
        
        const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
        appendSystemMessage(`📋 Texto copiado al portapapeles (${text.length} caracteres)\n"${preview}"`);
        
        return { 
          success: true, 
          action: 'copy',
          length: text.length,
          preview: preview
        };

      } catch (error) {
        // El error más común es falta de permisos
        let message = 'Error al copiar: ' + error.message;
        
        if (error.name === 'NotAllowedError') {
          message = 'Permiso denegado. El navegador requiere interacción del usuario.';
        }
        
        appendSystemMessage('⚠️ ' + message);
        return { success: false, error: error.message, name: error.name };
      }
    },

    /**
     * Lee texto del portapapeles
     */
    async paste() {
      // Verificar soporte de API
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        appendSystemMessage('⚠️ API de lectura de portapapeles no soportada');
        return { success: false, error: 'Clipboard read not supported' };
      }

      try {
        const text = await navigator.clipboard.readText();
        
        if (!text) {
          appendSystemMessage('📋 Portapapeles vacío');
          return { success: true, content: '', empty: true };
        }

        const preview = text.length > 500 ? text.substring(0, 500) + '\n... [TRUNCADO]' : text;
        appendSystemMessage(`📋 Contenido del portapapeles (${text.length} caracteres):\n\`\`\`\n${preview}\n\`\`\``);
        
        return { 
          success: true, 
          content: text, 
          action: 'paste',
          length: text.length
        };

      } catch (error) {
        let message = 'Error al leer portapapeles: ' + error.message;
        
        if (error.name === 'NotAllowedError') {
          message = 'Permiso denegado. Permite el acceso al portapapeles en la configuración del navegador.';
        }
        
        appendSystemMessage('⚠️ ' + message);
        return { success: false, error: error.message, name: error.name };
      }
    }
  },

  notifications: {
    /**
     * Solicita permiso para notificaciones
     */
    async requestPermission() {
      if (!('Notification' in window)) {
        appendSystemMessage('⚠️ Notificaciones no soportadas en este navegador');
        return { success: false, error: 'Notifications not supported' };
      }

      try {
        const permission = await Notification.requestPermission();
        
        let message = '';
        if (permission === 'granted') {
          message = '✅ Permiso de notificaciones concedido';
        } else if (permission === 'denied') {
          message = '⚠️ Permiso de notificaciones denegado';
        } else {
          message = '⏸️ Permiso de notificaciones pospuesto';
        }
        
        appendSystemMessage(message);
        return { success: permission === 'granted', permission };

      } catch (error) {
        appendSystemMessage('⚠️ Error al solicitar permisos: ' + error.message);
        return { success: false, error: error.message };
      }
    },

    /**
     * Muestra una notificación
     */
    async show(title, body, options = {}) {
      if (!('Notification' in window)) {
        appendSystemMessage('⚠️ Notificaciones no soportadas');
        return { success: false, error: 'Notifications not supported' };
      }

      // Verificar permisos
      if (Notification.permission === 'denied') {
        appendSystemMessage('⚠️ Notificaciones bloqueadas. Permite las notificaciones en la configuración del navegador.');
        return { success: false, error: 'Permission denied' };
      }

      if (Notification.permission !== 'granted') {
        appendSystemMessage('⚠️ Solicita permiso de notificaciones primero');
        const permResult = await this.requestPermission();
        if (!permResult.success) {
          return permResult;
        }
      }

      try {
        // Opciones de la notificación
        const notificationOptions = {
          body: body,
          icon: options.icon || '💻',
          badge: options.badge,
          tag: options.tag || 'netrunner',
          requireInteraction: options.requireInteraction || false,
          silent: options.silent || false,
          data: options.data || {}
        };

        const notification = new Notification(title, notificationOptions);

        // Eventos de la notificación
        notification.onclick = () => {
          window.focus();
          notification.close();
        };

        notification.onerror = (error) => {
          console.error('Error en notificación:', error);
        };

        appendSystemMessage(`🔔 Notificación enviada: "${title}"`);
        
        return { 
          success: true, 
          title, 
          body,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        appendSystemMessage('⚠️ Error al mostrar notificación: ' + error.message);
        return { success: false, error: error.message };
      }
    }
  },

  download: {
    /**
     * Descarga texto como archivo
     */
    text(content, filename = 'netrunner-download.txt') {
      if (!content) {
        appendSystemMessage('⚠️ Error: Contenido vacío para descargar');
        return { success: false, error: 'Empty content' };
      }

      try {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = sanitizeFilename(filename);
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Liberar URL después de un tiempo
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        const size = formatBytes(blob.size);
        appendSystemMessage(`⬇️ Descarga iniciada: ${a.download} (${size})`);
        
        return { 
          success: true, 
          filename: a.download,
          size: blob.size,
          type: 'text/plain'
        };

      } catch (error) {
        appendSystemMessage('⚠️ Error al descargar: ' + error.message);
        return { success: false, error: error.message };
      }
    },

    /**
     * Descarga JSON como archivo
     */
    json(data, filename = 'netrunner-data.json') {
      try {
        const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = sanitizeFilename(filename);
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        const size = formatBytes(blob.size);
        appendSystemMessage(`⬇️ Descarga JSON iniciada: ${a.download} (${size})`);
        
        return { 
          success: true, 
          filename: a.download,
          size: blob.size,
          type: 'application/json'
        };

      } catch (error) {
        appendSystemMessage('⚠️ Error al descargar JSON: ' + error.message);
        return { success: false, error: error.message };
      }
    },

    /**
     * Descarga datos binarios
     */
    binary(data, filename = 'netrunner-file.bin', mimeType = 'application/octet-stream') {
      try {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = sanitizeFilename(filename);
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        const size = formatBytes(blob.size);
        appendSystemMessage(`⬇️ Descarga iniciada: ${a.download} (${size})`);
        
        return { 
          success: true, 
          filename: a.download,
          size: blob.size,
          type: mimeType
        };

      } catch (error) {
        appendSystemMessage('⚠️ Error al descargar: ' + error.message);
        return { success: false, error: error.message };
      }
    }
  },

  /**
   * Abre una URL en nueva pestaña
   */
  openUrl(url) {
    if (!url || typeof url !== 'string') {
      appendSystemMessage('⚠️ Error: URL inválida');
      return { success: false, error: 'Invalid URL' };
    }

    try {
      // Normalizar URL
      let normalizedUrl = url.trim();
      
      // Añadir https:// si no tiene protocolo
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = 'https://' + normalizedUrl;
      }

      // Validar URL
      try {
        new URL(normalizedUrl);
      } catch (e) {
        appendSystemMessage('⚠️ URL malformada: ' + url);
        return { success: false, error: 'Malformed URL' };
      }

      // Abrir en nueva pestaña con seguridad
      const newWindow = window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
      
      if (!newWindow) {
        appendSystemMessage('⚠️ Popup bloqueado. Permite popups para este sitio.');
        return { success: false, error: 'Popup blocked' };
      }

      appendSystemMessage(`🔗 Abriendo: ${normalizedUrl}`);
      
      return { 
        success: true, 
        url: normalizedUrl,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      appendSystemMessage('⚠️ Error al abrir URL: ' + error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Obtiene información del navegador y sistema
   */
  getBrowserInfo() {
    try {
      const info = {
        // Navegador
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor,
        language: navigator.language,
        languages: navigator.languages,
        
        // Características
        cookiesEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        doNotTrack: navigator.doNotTrack,
        
        // Pantalla
        screenWidth: screen.width,
        screenHeight: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
        
        // Viewport
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        
        // Memoria (si está disponible)
        deviceMemory: navigator.deviceMemory || 'N/A',
        hardwareConcurrency: navigator.hardwareConcurrency || 'N/A',
        
        // Conexión
        connectionType: navigator.connection?.effectiveType || 'N/A',
        connectionDownlink: navigator.connection?.downlink || 'N/A',
        
        // Detección de características
        features: {
          serviceWorker: 'serviceWorker' in navigator,
          geolocation: 'geolocation' in navigator,
          notifications: 'Notification' in window,
          clipboard: 'clipboard' in navigator,
          fileSystem: 'showDirectoryPicker' in window,
          webGL: !!document.createElement('canvas').getContext('webgl'),
          localStorage: (() => {
            try {
              return 'localStorage' in window && window.localStorage !== null;
            } catch(e) {
              return false;
            }
          })()
        }
      };

      // Formatear para mostrar
      const infoText = 
        '🌐 Información del Navegador y Sistema\n\n' +
        '```\n' +
        '=== NAVEGADOR ===\n' +
        `User Agent: ${info.userAgent}\n` +
        `Plataforma: ${info.platform}\n` +
        `Vendor: ${info.vendor}\n` +
        `Idioma: ${info.language}\n` +
        `Online: ${info.onLine ? 'Sí' : 'No'}\n\n` +
        '=== PANTALLA ===\n' +
        `Resolución: ${info.screenWidth}x${info.screenHeight}\n` +
        `Disponible: ${info.availWidth}x${info.availHeight}\n` +
        `Viewport: ${info.viewportWidth}x${info.viewportHeight}\n` +
        `Color Depth: ${info.colorDepth} bits\n\n` +
        '=== HARDWARE ===\n' +
        `Memoria: ${info.deviceMemory} GB\n` +
        `Núcleos CPU: ${info.hardwareConcurrency}\n` +
        `Conexión: ${info.connectionType}\n\n` +
        '=== CARACTERÍSTICAS ===\n' +
        `Service Worker: ${info.features.serviceWorker ? '✓' : '✗'}\n` +
        `Geolocalización: ${info.features.geolocation ? '✓' : '✗'}\n` +
        `Notificaciones: ${info.features.notifications ? '✓' : '✗'}\n` +
        `Portapapeles: ${info.features.clipboard ? '✓' : '✗'}\n` +
        `File System API: ${info.features.fileSystem ? '✓' : '✗'}\n` +
        `WebGL: ${info.features.webGL ? '✓' : '✗'}\n` +
        `LocalStorage: ${info.features.localStorage ? '✓' : '✗'}\n` +
        '```';

      appendSystemMessage(infoText);
      
      return { success: true, ...info };

    } catch (error) {
      appendSystemMessage('⚠️ Error al obtener información: ' + error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Obtiene la ubicación geográfica del usuario (requiere permisos)
   */
  async getLocation() {
    if (!('geolocation' in navigator)) {
      appendSystemMessage('⚠️ Geolocalización no soportada');
      return { success: false, error: 'Geolocation not supported' };
    }

    return new Promise((resolve) => {
      appendSystemMessage('📍 Solicitando ubicación...');

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: new Date(position.timestamp).toISOString()
          };

          appendSystemMessage(
            `📍 Ubicación obtenida:\n` +
            `Lat: ${loc.latitude.toFixed(6)}, Lng: ${loc.longitude.toFixed(6)}\n` +
            `Precisión: ±${Math.round(loc.accuracy)}m`
          );

          resolve({ success: true, ...loc });
        },
        (error) => {
          let message = 'Error de geolocalización: ';
          
          switch(error.code) {
            case error.PERMISSION_DENIED:
              message += 'Permiso denegado';
              break;
            case error.POSITION_UNAVAILABLE:
              message += 'Posición no disponible';
              break;
            case error.TIMEOUT:
              message += 'Timeout';
              break;
            default:
              message += error.message;
          }

          appendSystemMessage('⚠️ ' + message);
          resolve({ success: false, error: message, code: error.code });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  }
};

/**
 * Detecta si el texto contiene una acción del navegador
 */
function isBrowserAction(text) {
  if (!text || typeof text !== 'string') return null;

  const actionPatterns = {
    copy: /\{\s*"action"\s*:\s*"copy"/,
    paste: /\{\s*"action"\s*:\s*"paste"/,
    notify: /\{\s*"action"\s*:\s*"(notify|notification)"/,
    download: /\{\s*"action"\s*:\s*"(download|save)"/,
    open: /\{\s*"action"\s*:\s*"(open|open_url)"/,
    info: /\{\s*"action"\s*:\s*"(browser_info|system_info)"/,
    location: /\{\s*"action"\s*:\s*"(location|geolocation|get_location)"/
  };

  for (const [actionType, pattern] of Object.entries(actionPatterns)) {
    if (pattern.test(text)) {
      try {
        const match = text.match(/\{[\s\S]*?\}/);
        if (!match) continue;

        const parsed = JSON.parse(match[0]);
        
        // Validar que la acción coincide
        if (parsed.action && 
            (parsed.action === actionType || 
             parsed.action.includes(actionType) ||
             actionPatterns[actionType].test(JSON.stringify(parsed)))) {
          return parsed;
        }

      } catch (e) {
        continue;
      }
    }
  }
  
  return null;
}

/**
 * Ejecuta una acción del navegador desde JSON
 */
async function executeBrowserAction(actionJSON) {
  if (!actionJSON || typeof actionJSON !== 'object') {
    return { success: false, error: 'Formato de acción inválido' };
  }

  const action = actionJSON.action;

  switch (action) {
    case 'copy':
      return await browserAutomation.clipboard.copy(
        actionJSON.text || actionJSON.content || ''
      );

    case 'paste':
      return await browserAutomation.clipboard.paste();

    case 'notify':
    case 'notification':
      if (!actionJSON.title || !actionJSON.body) {
        return { 
          success: false, 
          error: 'Faltan parámetros: se requiere "title" y "body"' 
        };
      }
      return await browserAutomation.notifications.show(
        actionJSON.title, 
        actionJSON.body,
        actionJSON.options || {}
      );

    case 'download':
    case 'save':
      if (!actionJSON.content) {
        return { success: false, error: 'Falta parámetro "content"' };
      }
      
      const downloadType = actionJSON.type || 'text';
      if (downloadType === 'json') {
        return browserAutomation.download.json(actionJSON.content, actionJSON.filename);
      } else {
        return browserAutomation.download.text(actionJSON.content, actionJSON.filename);
      }

    case 'open':
    case 'open_url':
      if (!actionJSON.url) {
        return { success: false, error: 'Falta parámetro "url"' };
      }
      return browserAutomation.openUrl(actionJSON.url);

    case 'browser_info':
    case 'system_info':
      return browserAutomation.getBrowserInfo();

    case 'location':
    case 'geolocation':
    case 'get_location':
      return await browserAutomation.getLocation();

    case 'request_notification_permission':
      return await browserAutomation.notifications.requestPermission();

    default:
      return { 
        success: false, 
        error: 'Acción desconocida: ' + action,
        available: ['copy', 'paste', 'notify', 'download', 'open', 'browser_info', 'location']
      };
  }
}

// Funciones auxiliares

function sanitizeFilename(filename) {
  if (!filename) return 'download.txt';
  
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '_')
    .substring(0, 255);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Exportar si estamos en módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    browserAutomation,
    isBrowserAction,
    executeBrowserAction
  };
}
