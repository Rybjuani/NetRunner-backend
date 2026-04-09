# Kaisen

Kaisen es una app de chat multiagente tipo mesa redonda inspirada en Jujutsu Kaisen. La experiencia no simula un chat 1 a 1: el usuario le habla a una mesa formada por Sukuna, Gojo, Itadori, Megumi, Todo y Mahito, y el sistema decide de forma controlada quien responde, en que orden y con que ritmo.

## Principios del proyecto

- Conversacion grupal primero, no asistente individual.
- Si el usuario le habla a un personaje concreto, ese personaje responde primero.
- Los demas pueden intervenir despues, pero no robar la respuesta principal.
- Una sola voz escribiendo a la vez.
- 1 a 3 respuestas por turno de usuario, salvo que el prompt fuerce otra dinamica.
- Personalidades marcadas y consistentes por personaje.
- Salida y superficie de producto en español.
- Sin telemetria, sin fingerprinting, sin MongoDB, sin recoleccion pasiva.
- Backend minimo, deployable en Railway.

## Estado actual

- Frontend nuevo con UI oscura, panel de roster, estados vivos y avatares circulares.
- Backend modular con orquestador de mesa redonda, capa de providers y prompts por personaje.
- Fallback chain entre `Groq`, `Ollama` y `OpenCode Zen`.
- Avatares locales listos en `public/avatars/`.
- Persistencia backend eliminada por completo.
- Ownership conversacional: foco por nombre, alias o continuidad corta.
- Errores API y estados visibles localizados en español.

## Stack

- Node.js 18+
- Express
- Frontend estatico servido por el mismo backend
- Providers externos:
  - Groq
  - Ollama Cloud
  - OpenCode Zen

## Documentacion

- Arquitectura: [docs/architecture.md](docs/architecture.md)
- API: [docs/api.md](docs/api.md)
- Personajes: [docs/characters.md](docs/characters.md)
- Deploy y operacion: [docs/deployment.md](docs/deployment.md)

## Inicio rapido

### 1. Instalar

```bash
npm install
```

### 2. Configurar entorno

Kaisen lee estas variables desde `process.env` y conserva exactamente estos nombres:

```env
GROQ_API_KEY=
OLLAMA_API_KEY=
OPENCODE_ZEN_API_KEY=
DEFAULT_PROVIDER=groq
FALLBACK_PROVIDER=ollama
SECONDARY_PROVIDER=zen
CHAT_MAX_PARALLEL_AGENTS=3
CHAT_MAX_ROUND_TURNS=6
CHAT_REQUEST_TIMEOUT_MS=45000
CHAT_ENABLE_STREAM=true
PORT=8080
```

### 3. Correr

```bash
npm run dev
```

o:

```bash
npm start
```

App local:

- `http://localhost:8080`

Health:

- `GET http://localhost:8080/api/health`

Smoke local de orquestacion:

```bash
npm run test:smoke
```

## Estructura del proyecto

```text
.
├── public/
│   ├── avatars/
│   ├── index.html
│   └── src/
├── shared/
├── src/
│   ├── config/
│   ├── lib/
│   ├── providers/
│   └── services/
├── docs/
├── server.js
├── package.json
└── README.md
```

## Lo que ya no existe

El proyecto anterior fue eliminado a nivel funcional y estructural:

- No hay `MongoDB`
- No hay `Mongoose`
- No hay `Socket.IO`
- No hay `/api/telemetry`
- No hay `/api/report`
- No hay diagnosticos WebRTC
- No hay fingerprinting
- No hay captura de IP
- No hay hooks externos
- No hay logs invasivos ni persistencia innecesaria

## Configuracion de personajes

Asignacion inicial actual:

- Sukuna -> `zen`
- Gojo -> `groq`
- Itadori -> `groq`
- Megumi -> `ollama`
- Todo -> `groq`
- Mahito -> `ollama`

La configuracion editable vive en:

- [src/config/characters.js](src/config/characters.js)
- [shared/kaisen-config.js](shared/kaisen-config.js)
- [src/config/runtime.js](src/config/runtime.js)

## Railway

- Build: `npm run install:prod`
- Start: `npm start`
- Variables: las mismas listadas arriba

## Nota operativa

Si faltan claves de providers, la app sigue arrancando y `POST /api/chat` responde `503` con un error claro. Eso permite desplegar la UI y validar estructura aun antes de terminar la configuracion del entorno.

## Reglas conversacionales clave

- Nombrar a `Gojo`, `Sukuna`, `Itadori`, `Megumi`, `Todo` o `Mahito` funciona con nombre o alias, sin necesidad de `@`.
- Si el mensaje es claramente para un personaje, ese personaje queda como `targetSpeaker` y responde primero.
- Si el usuario manda un follow-up corto como `¿y por que?`, `bien gracias` o `claro`, el foco sigue en el mismo personaje mientras no cambie la escena.
- En prompts abiertos al grupo, la mesa puede cruzarse de forma natural sin perder control ni saturar el chat.
- La app fuerza salida en español tanto en prompts como en mensajes visibles del producto.
