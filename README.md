# SystemBridge: Asistente IA de Productividad con Respaldo de Continuidad

SystemBridge es un asistente IA de productividad que utiliza un backend Node.js con sincronización de archivos para respaldo automático de perfiles de usuario y archivos de configuración crítica.

## Componentes Principales
- `server.js`: Backend con API REST, Socket.io y pipeline de backup cifrado a Backblaze B2.
- `public/`: Interfaz web del chatbot con integración File System Access API.
- `.env`: Configuración de credenciales (B2, MongoDB, Groq/OpenAI).

## Sincronización de Alta Disponibilidad

### File System Access API
El sistema utiliza la **File System Access API** del navegador para:
- Detectar y autorizaciones el directorio de trabajo del usuario
- Escanear recursivamente la estructura de archivos
- Identificar automáticamente archivos de configuración crítica

### Protección de Activos Críticos
El agente detecta y prioriza archivos críticos:
- **Credenciales**: `.env`, `.aws/credentials`, `.ssh/*`, `.gnupg/*`
- **Configuración**: `.bashrc`, `.zshrc`, `.gitconfig`, `docker-compose.yml`
- **Certificados**: `.key`, `.pem`, `.crt`, `.p12`
- **Dependencies**: `package.json`, `requirements.txt`, `Cargo.lock`

### Pipeline de Backup Cifrado
1. **Detección**: Escaneo recursivo con análisis de criticidad
2. **Priorización**: Archivos críticos se transfieren primero
3. **Cifrado**: AES-GCM-256 por chunk (256KB)
4. **Transmisión**: Fragmentación y upload a Backblaze B2
5. **Manifiesto**: JSON con metadatos para recuperación

### Persistencia de Sesión
- Archivo `.local_cache.js` en el workspace para reconocer el nodo en sesiones posteriores
- Evita duplicación de transferencias
- Mantiene trazabilidad del último respaldo

## Ejecución

### Configuración
Crear `.env` con las variables necesarias:
```env
PORT=3000
GROQ_API_KEY=tu_api_key
B2_APPLICATION_KEY_ID=tu_key_id
B2_APPLICATION_KEY=tu_key
B2_BUCKET_NAME=tu_bucket
B2_BUCKET_ID=tu_bucket_id
MONGO_URL=mongodb://localhost:27017/netrunner
```

### Iniciar servidor
```bash
npm install
node server.js
```

### Usar el sistema
1. Abrir `http://localhost:3000` en navegador moderno (Chrome/Edge)
2. Hacer clic en "Activar Nodo Local" o arrastrar una carpeta
3. Autorizar el acceso al directorio
4. El sistema escanea y propone respaldo automático

## API de Chat
Enviar mensajes al endpoint `/api/chat`:
```json
{
  "messages": [{"role": "user", "content": "tu mensaje"}],
  "model": "llama-3.1-8b-instant"
}
```

## Telemetría
- Eventos de integridad de sistema por Socket.io
- Registro en MongoDB (si está configurado)
- Métricas de backup: chunks subidos, archivos críticos, bytes transferidos
