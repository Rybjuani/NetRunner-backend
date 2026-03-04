# NetRunner IDE Autónomo

## Puente Local (Bridge)

1. Instala dependencias:
   ```bash
   cd bridge
   npm install
   ```
2. Inicia el Bridge:
   ```bash
   node index.js
   ```
   El Bridge se ejecuta en `ws://localhost:8080` y solo acepta conexiones de `localhost`, `http://localhost:3000`, `http://localhost:5173` y el dominio configurado en `process.env.ALLOWED_DOMAIN`.

## Lanzar la Web

1. Instala dependencias:
   ```bash
   cd public
   npm install
   ```
2. Inicia el servidor Express (asegúrate de que los headers COOP/COEP estén activos en `server.js`):
   ```bash
   node ../server.js
   ```
3. Accede a la web en tu navegador en `http://localhost:3000` o `http://localhost:5173`.

## Prueba de Concepto

En el chat, ejecuta:
```
runTestScript()
```
Esto creará un archivo `index.js` con un `console.log`, instalará dependencias y lo ejecutará. Verás la salida en tiempo real en el terminal integrado.

## Sincronización y Streaming
- El editor Monaco se actualiza automáticamente cuando la IA o el Bridge modifican archivos.
- El terminal xterm.js muestra la salida de comandos en tiempo real.
- Los pensamientos de la IA (`<thinking>`) se renderizan en el chat con estilo 'faded'.

## Requisitos
- Node.js >= 18
- Navegador compatible con WebContainer y COOP/COEP

## Soporte
Para dudas o mejoras, contacta al equipo de NetRunner.
