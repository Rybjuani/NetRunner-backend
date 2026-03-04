# 🤖 NetRunner Pro v4.0

> Asistente de IA inteligente con ejecución de código, gestión de archivos y automatización del navegador.

![Version](https://img.shields.io/badge/version-4.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

**🌐 Demo en vivo**: https://netrunner-pro.up.railway.app

---

## 📋 Tabla de Contenidos

1. [Características](#-características)
2. [Instalación](#-instalación-rápida)
3. [Deploy en Railway](#️-deploy-en-railway)
4. [Configuración](#️-configuración)
5. [Uso](#-ejemplos-de-uso)
6. [API](#-api-endpoints)
7. [Arquitectura](#️-arquitectura)
8. [Troubleshooting](#-troubleshooting)
9. [Roadmap](#-roadmap)

---

## ✨ Características

### 🤖 IA Conversacional
- **Groq** (ultra rápido y gratuito) - Llama 3.1/3.3
- **OpenCode Zen** (optimizado para código)
- Respuestas en **streaming en tiempo real** (SSE)
- Interfaz intuitiva con mensaje de bienvenida amigable

### ⚡ Ejecución de Código
- **18+ lenguajes** soportados (Python, JavaScript, Java, C++, Go, Rust, etc.)
- Ejecución segura en **sandbox aislado** (Piston API)
- Salida en tiempo real con metadata de ejecución
- Límites de seguridad: 50KB código, 10s timeout

### 📁 Gestión de Archivos
- Sistema de **permisos por confirmación**
- Crear y leer archivos localmente
- **Sin necesidad de workspace previo**
- Cada operación pide permiso explícito (más seguro)
- Soporte para File System Access API (Chrome/Edge)

### 🌐 Automatización del Navegador
- Copiar/pegar portapapeles
- Notificaciones del sistema
- Abrir URLs automáticamente
- Información detallada del navegador
- Descargar archivos generados

### 🎨 Interfaz Moderna
- Diseño **cyberpunk** con efectos visuales
- Mensaje de bienvenida **intuitivo y amigable**
- Cards clicables con ejemplos de uso
- Responsive (funciona en móviles)
- Animaciones fluidas

---

## 🚀 Instalación Rápida

### Requisitos Previos
- **Node.js >= 18**
- Cuenta gratuita en [Groq](https://console.groq.com) (obtén tu API key)

### Instalación Local

```bash
# 1. Clonar el repositorio
git clone https://github.com/Rybjuani/NetRunner-backend.git
cd NetRunner-backend

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env

# 4. Editar .env y añadir tu API key
# GROQ_API_KEY=gsk_tu_api_key_aqui

# 5. Iniciar servidor
npm start

# 6. Abrir en el navegador
# http://localhost:3000
```

---

## ☁️ Deploy en Railway

### Método 1: Deploy desde GitHub (Recomendado)

1. **Fork** este repositorio en tu cuenta de GitHub

2. Ve a [railway.app](https://railway.app) y crea cuenta

3. Click en **"New Project"** → **"Deploy from GitHub repo"**

4. Autoriza Railway y selecciona tu fork

5. **Configura las variables de entorno** en Railway:
   - Ve a la pestaña "Variables"
   - Añade: `GROQ_API_KEY=gsk_tu_api_key_aqui`
   - Añade: `NODE_ENV=production`

6. **Genera dominio público**:
   - Ve a "Settings" → "Networking"
   - Click en "Generate Domain"
   - Railway te dará una URL como `tu-app.railway.app`

7. **Verifica** que todo funciona visitando:
   ```
   https://tu-app.railway.app/health
   ```

### Método 2: Railway CLI

```bash
# Instalar CLI
npm i -g @railway/cli

# Login
railway login

# Iniciar proyecto
railway init

# Configurar variables
railway variables set GROQ_API_KEY=gsk_...
railway variables set NODE_ENV=production

# Deploy
railway up
```

---

## ⚙️ Configuración

### Variables de Entorno

| Variable | Requerida | Descripción | Valor por Defecto |
|----------|-----------|-------------|-------------------|
| `GROQ_API_KEY` | Sí* | API key de Groq | - |
| `OPENCODE_ZEN_API_KEY` | Sí* | API key de OpenCode | - |
| `PORT` | No | Puerto del servidor | 3000 |
| `NODE_ENV` | No | Entorno de ejecución | development |

**\*Al menos una API key es requerida**

### Obtener API Keys Gratis

#### Groq (Recomendado):
1. Ve a https://console.groq.com
2. Crea una cuenta gratuita
3. Ve a "API Keys"
4. Click en "Create API Key"
5. Copia la key que empieza con `gsk_...`

#### OpenCode Zen:
1. Ve a https://opencode.ai
2. Regístrate gratis
3. Ve a tu perfil → API Keys
4. Genera una nueva key

### Modelos Disponibles

**Groq (Recomendado por velocidad):**
- `groq:llama-3.1-8b-instant` ⭐ (por defecto - ultra rápido)
- `groq:llama-3.1-70b-versatile` (más inteligente)
- `groq:llama-3.3-70b-specdec` (el más nuevo)
- `groq:mixtral-8x7b-32768` (ventana de contexto grande)

**OpenCode Zen:**
- `opencode:opencodezen-bigpickle` (agente de código)
- `opencode:opencodezen-mini` (versión ligera)

---

## 🎯 Ejemplos de Uso

### Conversación Natural
```
Usuario: "Explícame qué es JavaScript en términos simples"
NetRunner: [Respuesta detallada en streaming palabra por palabra]
```

### Ejecutar Código
```
Usuario: "Ejecuta este código Python: print('Hola mundo')"
NetRunner: [Ejecuta y muestra]:
✅ Ejecutado en 245ms
Salida: Hola mundo
```

### Crear Archivos
```
Usuario: "Crea un archivo notas.txt con mis tareas del día"
NetRunner: [Muestra diálogo de confirmación]
📝 ¿Crear archivo "notas.txt"?
Contenido: mis tareas del día
Tamaño: 18 bytes

[Usuario acepta y elige ubicación]
✅ Archivo "notas.txt" creado exitosamente
```

### Leer Archivos
```
Usuario: "Lee un archivo de mi computadora"
NetRunner: [Muestra diálogo de confirmación]
📖 ¿Abrir un archivo para leer?

[Usuario acepta y selecciona archivo]
📄 config.json
Tamaño: 1.2 KB

{ "setting": "value" }
```

### Automatización del Navegador
```
Usuario: "Abre YouTube"
NetRunner: [Abre YouTube en nueva pestaña]
✅ Abierto: https://youtube.com

Usuario: "Cópiame este texto al portapapeles: Hola mundo"
NetRunner: ✅ Texto copiado al portapapeles
```

---

## 📡 API Endpoints

### `GET /health`
Verifica el estado del servidor y proveedores disponibles.

**Respuesta:**
```json
{
  "ok": true,
  "mode": "groq",
  "providers": ["groq"],
  "version": "4.0.0"
}
```

### `POST /api/chat`
Envía mensajes a la IA y recibe respuestas.

**Request:**
```json
{
  "messages": [
    {"role": "user", "content": "Hola"}
  ],
  "model": "groq:llama-3.1-8b-instant"
}
```

**Response:**
```json
{
  "text": "¡Hola! ¿En qué puedo ayudarte hoy?",
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 15,
    "total_tokens": 25
  },
  "provider": "groq",
  "model": "llama-3.1-8b-instant"
}
```

### `POST /api/chat/stream`
Recibe respuestas en streaming usando Server-Sent Events (SSE).

**Request:** Igual que `/api/chat`

**Response:** Stream de eventos SSE
```
data: {"content":"Hola"}
data: {"content":" ¿cómo"}
data: {"content":" estás?"}
data: [DONE]
```

---

## 🛠️ Arquitectura

### Estructura del Proyecto

```
NetRunner-backend/
├── server.js                    # Servidor Express principal
├── package.json                 # Dependencias (solo Express)
├── .env.example                 # Template de configuración
├── .gitignore                   # Archivos ignorados por Git
├── README.md                    # Esta documentación
│
└── public/                      # Frontend estático
    ├── index.html               # Interfaz principal
    └── src/
        ├── config.js            # Configuración del cliente
        ├── chat.js              # Lógica de chat
        ├── executor.js          # Ejecución de código
        ├── filesystem-simple.js # Sistema de archivos
        ├── browser.js           # Automatización
        ├── welcome.js           # Mensaje de bienvenida
        ├── welcome-styles.css   # Estilos del mensaje
        └── styles.css           # Estilos principales
```

### Stack Tecnológico

**Backend:**
- Node.js >= 18
- Express.js 4.18
- Server-Sent Events (SSE)

**Frontend:**
- Vanilla JavaScript (ES6+)
- CSS3 con animaciones
- File System Access API
- Fetch API con streaming

**APIs Externas:**
- Groq API (LLM)
- OpenCode Zen API (LLM)
- Piston API (ejecución de código)

### Flujo de Datos

```
Usuario → Frontend → Backend → Groq/OpenCode API
                                      ↓
Frontend ← Streaming SSE ← Backend ← Respuesta
```

---

## 🔒 Seguridad

### Implementado ✅

- **Rate limiting**: 30 requests/minuto por IP
- **Timeouts**: 30s en API calls, 60s en streaming
- **Validación exhaustiva** de entrada (roles, contenido, longitud)
- **CORS restrictivo**: Solo orígenes permitidos
- **Security headers**: XSS, Clickjacking, MIME sniffing
- **API keys en servidor**: Nunca expuestas al cliente
- **Sandbox de código**: Ejecución aislada (Piston)
- **Permisos explícitos**: Usuario confirma cada operación de archivo

### Límites de Seguridad

```javascript
const LIMITS = {
  MAX_CODE_LENGTH: 50000,      // 50KB
  MAX_FILE_SIZE: 10485760,     // 10MB
  MAX_REQUESTS_PER_WINDOW: 30, // 30 req/min
  EXECUTION_TIMEOUT: 10000,    // 10s
  API_TIMEOUT: 30000           // 30s
};
```

---

## 📊 Límites y Consideraciones

### Groq API (Plan Gratuito)
- ✅ **Velocidad**: < 1 segundo por respuesta
- ⚠️ **Rate limit**: ~30 peticiones/minuto
- ✅ **Sin límite diario** de tokens
- ✅ **Modelos incluidos**: Llama 3.1, 3.3, Mixtral

### OpenCode Zen API
- ✅ **Gratis** para uso básico
- ⚠️ **Más lento** que Groq (~3-5s)
- ⚠️ **Límites** según plan

### Piston API (Ejecución de Código)
- ✅ **Gratuito** ilimitado
- ⚠️ **Timeout**: 3 segundos
- ⚠️ **Memoria**: Limitada por Piston
- ⚠️ **Sin acceso a red** (sandbox aislado)

### File System Access API
- ⚠️ **Solo Chrome/Edge/Opera** (no Firefox/Safari)
- ⚠️ **Requiere HTTPS** en producción
- ✅ **Permisos explícitos** por operación (más seguro)
- ✅ **Sin límite** de tamaño (definido por nosotros: 10MB)

---

## 🐛 Troubleshooting

### Error: "Sistema sin configurar"

**Causa**: Falta la variable `GROQ_API_KEY` o `OPENCODE_ZEN_API_KEY`

**Solución**:
1. Verifica que `.env` existe (local) o que Railway tiene la variable
2. Asegúrate de que la API key es válida y empieza con `gsk_`
3. Reinicia el servidor después de añadir la variable

```bash
# Local
echo "GROQ_API_KEY=gsk_tu_key" > .env
npm start

# Railway
railway variables set GROQ_API_KEY=gsk_tu_key
```

### Error: "Could not resolve host"

**Causa**: Problemas de red o API temporalmente caída

**Solución**:
1. Verifica tu conexión a internet
2. Comprueba el estado de Groq: https://status.groq.com
3. Intenta con otro proveedor (OpenCode)
4. Revisa los logs del servidor para más detalles

### El sistema de archivos no funciona

**Causa**: Navegador no compatible o permisos denegados

**Solución**:
1. **Usa Chrome, Edge u Opera** (File System Access API no funciona en Firefox/Safari)
2. **Acepta los permisos** cuando el navegador los solicite
3. En producción, asegúrate de que el sitio use **HTTPS**
4. Verifica en la consola del navegador (F12) si hay errores

### Código no se ejecuta

**Causa**: Lenguaje no soportado, error de sintaxis, o Piston API caído

**Solución**:
1. Verifica que el lenguaje está soportado (ver lista en Características)
2. Revisa la sintaxis del código
3. Comprueba que Piston API está funcionando: https://emkc.org/api/v2/piston/runtimes
4. Consulta los logs del servidor

### El streaming no funciona

**Causa**: Navegador no soporta SSE o problema de CORS

**Solución**:
1. Verifica que usas un navegador moderno
2. Abre la consola (F12) y busca errores de CORS
3. Asegúrate de que el endpoint `/api/chat/stream` está funcionando:
   ```bash
   curl https://tu-app.railway.app/health
   ```

### Error 429: Too Many Requests

**Causa**: Rate limiting activado (más de 30 requests en 1 minuto)

**Solución**:
1. Espera 1 minuto antes de hacer más requests
2. Si es legítimo, considera aumentar el límite en `server.js`:
   ```javascript
   const MAX_REQUESTS_PER_WINDOW = 50; // Aumentar a 50
   ```

---

## 🎨 Personalización

### Cambiar el Modelo por Defecto

Edita `public/src/config.js`:

```javascript
const CONFIG = {
  DEFAULT_MODEL: 'groq:llama-3.3-70b-specdec', // Cambiar aquí
  // ...
};
```

### Añadir Nuevos Modelos

En `public/src/config.js`, añade al array `MODELS`:

```javascript
{
  id: 'groq:nuevo-modelo',
  label: 'Nuevo Modelo (Groq)',
  description: 'Descripción del modelo'
}
```

### Personalizar el Mensaje de Bienvenida

Edita `public/src/welcome.js`, función `getWelcomeMessage()`:

```javascript
function getWelcomeMessage() {
  const messages = [
    'Tu mensaje personalizado aquí',
    '',
    '✨ Lo que puedo hacer:',
    // ...
  ];
  return messages.join('\n');
}
```

### Cambiar Colores del Tema

Edita `public/src/styles.css`, variables CSS al inicio:

```css
:root {
  --cyber-primary: #00ffff;    /* Color principal (cyan) */
  --cyber-secondary: #ff00ff;  /* Color secundario (magenta) */
  --cyber-bg: #0a0a14;         /* Fondo principal */
  /* ... */
}
```

---

## 📝 Roadmap

### v4.1 (Próximo - Q2 2025)
- [ ] Editor de código Monaco integrado
- [ ] Sidebar con historial de conversaciones
- [ ] Exportar conversaciones a Markdown/PDF
- [ ] Temas personalizables (Cyberpunk, Matrix, Minimal)
- [ ] Atajos de teclado (Ctrl+K, Ctrl+Enter, etc.)

### v4.5 (Q3 2025)
- [ ] Soporte para Claude API (Anthropic)
- [ ] Soporte para GPT-4 (OpenAI)
- [ ] Selector de modelos en UI
- [ ] Sistema de fallback entre proveedores
- [ ] Modo offline con LocalStorage

### v5.0 (Q4 2025 - Largo plazo)
- [ ] Autenticación de usuarios (OAuth)
- [ ] Base de datos para persistencia (MongoDB/PostgreSQL)
- [ ] Modo colaborativo multi-usuario
- [ ] Terminal integrado para comandos bash
- [ ] Integración con GitHub para repos
- [ ] Soporte para modelos locales (Ollama)
- [ ] Plugin system para extensibilidad

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! 

### Cómo Contribuir

1. **Fork** el proyecto
2. **Crea una rama** para tu feature:
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **Commit** tus cambios:
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```
4. **Push** a la rama:
   ```bash
   git push origin feature/AmazingFeature
   ```
5. **Abre un Pull Request**

### Guías de Contribución

- **Código**: Sigue el estilo existente, usa ES6+
- **Commits**: Usa mensajes descriptivos (ej: `feat: add new model`)
- **Tests**: Añade tests si es posible (próximamente)
- **Documentación**: Actualiza el README si añades features

---

## 📄 Licencia

MIT License

Copyright (c) 2025 Rybjuani

Se concede permiso, de forma gratuita, a cualquier persona que obtenga una copia
de este software y archivos de documentación asociados (el "Software"), para usar
el Software sin restricciones, incluyendo sin limitación los derechos de usar,
copiar, modificar, fusionar, publicar, distribuir, sublicenciar y/o vender copias
del Software, y permitir a las personas a quienes se les proporcione el Software
hacer lo mismo, sujeto a las siguientes condiciones:

El aviso de copyright anterior y este aviso de permiso se incluirán en todas
las copias o porciones sustanciales del Software.

EL SOFTWARE SE PROPORCIONA "TAL CUAL", SIN GARANTÍA DE NINGÚN TIPO, EXPRESA O
IMPLÍCITA, INCLUYENDO PERO NO LIMITADO A LAS GARANTÍAS DE COMERCIABILIDAD,
IDONEIDAD PARA UN PROPÓSITO PARTICULAR Y NO INFRACCIÓN.

---

## 🙏 Agradecimientos

- **[Groq](https://groq.com)** - Por su increíble API de LLM ultra rápida y gratuita
- **[OpenCode Zen](https://opencode.ai)** - Por sus modelos optimizados para código
- **[Piston](https://github.com/engineer-man/piston)** - Por la API de ejecución de código en múltiples lenguajes
- **[Railway](https://railway.app)** - Por el hosting gratuito y fácil deploy
- **[Font Awesome](https://fontawesome.com)** - Por los iconos
- **[Google Fonts](https://fonts.google.com)** - Por las fuentes Orbitron y Rajdhani

---

## 📞 Soporte y Contacto

### ¿Tienes problemas o preguntas?

- 🐛 **Reportar un bug**: [GitHub Issues](https://github.com/Rybjuani/NetRunner-backend/issues)
- 💬 **Discusiones**: [GitHub Discussions](https://github.com/Rybjuani/NetRunner-backend/discussions)
- 📧 **Email**: rybjuani@ejemplo.com
- 🌐 **Web**: https://netrunner-pro.up.railway.app

### Recursos Adicionales

- 📖 **Documentación de Groq**: https://console.groq.com/docs
- 📖 **Documentación de Piston**: https://github.com/engineer-man/piston
- 📖 **Documentación de Railway**: https://docs.railway.app

---

## ⭐ Dale una Estrella

Si este proyecto te resulta útil o te ayudó a aprender algo nuevo, ¡considera darle una ⭐ en GitHub!

Esto ayuda a que más personas descubran el proyecto.

---

## 🎉 Agradecimientos Especiales

Desarrollado con ❤️ y mucho código por **Rybjuani**

*Optimizado y mejorado con ayuda de Claude AI*

---

**NetRunner Pro v4.0** - Tu asistente de IA definitivo  
🚀 Rápido • 🔒 Seguro • 🆓 Gratuito

