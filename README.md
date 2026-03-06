# SystemBridge: Ecosistema de Asistencia IA y Gestion de Workspaces Distribuidos

SystemBridge integra un backend Node.js con una extension de navegador Manifest V3 para ejecutar flujos de productividad asistidos por IA de forma transparente y auditable.

## Componentes Principales
- `server.js`: API/Socket.io gateway para orquestacion de comandos y telemetria.
- `public/`: interfaz web del chatbot y bridge de deteccion de extension.
- `browser-extension/systembridge-connectivity-node/`: nodo oficial de conectividad en navegador.

## Capacidades de la Extension
- Estado de conectividad y control de "Modo Asistente Activo" desde `popup.html`.
- Puente bidireccional web <-> extension con `window.postMessage`.
- Automatizacion funcional:
- `LIST_TABS`, `GROUP_TABS_BY_DOMAIN`, `CLOSE_TABS_BY_DOMAIN`
- `EXTRACT_PAGE_TEXT`
- `SYNC_WORKSPACE`
- Persistencia Socket.io con reconexion exponencial y telemetria de disponibilidad del asistente.

## Ejecucion
1. Instalar dependencias del backend:
```bash
npm install
```
2. Iniciar servidor:
```bash
node server.js
```
3. Cargar extension en navegador:
1. Abrir `chrome://extensions`.
2. Activar "Developer mode".
3. "Load unpacked" apuntando a:
`browser-extension/systembridge-connectivity-node/`
4. Asegurar que `lib/socket.io.min.js` exista (ver `lib/README.md`).

## Trazabilidad Operativa
- Eventos de disponibilidad del asistente se reportan por Socket.io como:
- `assistant_availability_status`
- Logs operativos en `bridge_status.log`.
