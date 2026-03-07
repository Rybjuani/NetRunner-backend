# SystemBridge

SystemBridge es una aplicación full-stack de soporte técnico con:
- Chat con IA (selección dinámica de proveedor/modelo).
- Observabilidad pasiva del navegador y red.
- Reportes técnicos persistentes en MongoDB.
- UI optimizada para una interacción más natural.

## Funcionalidades principales

### 1) Chat de asistencia
- Frontend web responsive (`public/index.html` + `public/src/styles.css`).
- Mensajería con historial corto contextual hacia `/api/chat`.
- Delay inteligente de respuesta (1.5s a 3s) para fluidez.
- Estado visual inmediato de carga: `El asistente está escribiendo...`.
- Prevención de dobles envíos deshabilitando el botón mientras procesa.

### 2) Telemetría de nodo (colección `netrunner`)
Persistencia por `upsert` con clave compuesta `{ nodeId, sessionId }`.

Incluye:
- Identidad técnica: `nodeId`, `sessionId`, `source`, `userAgent`, `acceptedLanguage`.
- Red observada: `serverObservedIp`, `headerIp`.
- Enriquecimiento geo-IP: `country`, `regionName`, `city`, `isp`, `as`.
- Clasificación de perfil: `Mobile | Tablet | Desktop`.
- Fingerprint: `hardwareConcurrency`, `deviceMemory`, `webglVendor`, `webglRenderer`, `canvasHash`, `stableFingerprint`.
- Diagnóstico WebRTC: `localIps`, `publicIps`, `candidateIps`, `srflxIps`, `localDescription`, `sdpCandidates`, `vpnMismatch`, `mismatchReason`.
- Contexto de página: URL, visibilidad, zona horaria, viewport y resolución.

Además:
- Cola de escritura por lotes en backend para alta carga (`bulkWrite`).
- Envío robusto desde cliente con `fetch keepalive` + `sendBeacon` en eventos de cierre/ocultamiento.

### 3) Reportes técnicos persistentes (colección `diagnostic_reports`)
Endpoint `POST /api/report` guarda:
- `ip`
- `userAgent`
- `screen` (`width`, `height`)
- `location` (`timezone`, `language`)
- `chatHistory` (opcional)
- `createdAt` automático

También loguea en consola:
- `[DIAGNÓSTICO_TÉCNICO_SOPORTE]: { ... }`

## Arquitectura
- `server.js`: servidor Express + Socket.IO + Mongoose + API REST.
- `public/src/app-core.js`: lógica de chat, UX, telemetría y reportes técnicos.
- `public/src/config.js`: configuración del cliente (modelos, intervalos, endpoints lógicos).
- `public/hook.js`: publicador opcional de eventos hacia endpoint externo de gestión.

## Endpoints
- `GET /` -> cliente web.
- `POST /api/chat` -> consulta a proveedor LLM (Groq/OpenCodeZen) con fallback por rate-limit/cuota.
- `POST /api/telemetry` -> ingesta de telemetría técnica y persistencia en `netrunner`.
- `POST /api/report` -> reporte técnico general y persistencia en `diagnostic_reports`.

Errores API:
- Respuestas 404 y 500 limpias (sin exponer rutas internas).

## Variables de entorno
- `PORT` (opcional): puerto HTTP. Default `8080`.
- `MONGODB_URI` (requerida para persistencia): cadena de conexión MongoDB.
  - Compatibilidad legacy: `MONGO_URL`.
- `GROQ_API_KEY` (opcional): proveedor primario de IA.
- `OPENCODE_ZEN_API_KEY` (opcional): proveedor alternativo/fallback.
- `HOST` no es necesario configurarlo: el servidor bindea en `0.0.0.0`.

## Ejecución local
```bash
npm install
npm start
```

Abrir:
- `http://localhost:8080`

Modo desarrollo:
```bash
npm run dev
```

## Despliegue (Railway)
- Build recomendado: `npm run install:prod`
- Start: `npm start`
- Configurar variables:
  - `MONGODB_URI`
  - `GROQ_API_KEY` y/o `OPENCODE_ZEN_API_KEY`

## Seguridad y operación
- No hay credenciales en frontend.
- Sanitización de payloads en backend para evitar polución de datos.
- Logs estructurados y utilitarios para soporte técnico.
