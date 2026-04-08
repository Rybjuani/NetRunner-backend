# Arquitectura de Kaisen

## Objetivo

Kaisen esta diseñado para sostener una conversacion grupal multiagente con ritmo humano, sin convertir el chat en una rafaga de seis respuestas instantaneas.

## Capas

### 1. Entrada HTTP

- [server.js](../server.js)
- Sirve el frontend estatico.
- Expone solo:
  - `GET /api/health`
  - `POST /api/chat`

No hay base de datos, no hay websockets, no hay endpoints legacy.

### 2. Configuracion de runtime

- [src/config/runtime.js](../src/config/runtime.js)

Centraliza:

- lectura de variables de entorno
- orden global de fallback
- limites de ronda
- timeouts
- politica de streaming
- limites de historial

### 3. Configuracion de personajes

- [src/config/characters.js](../src/config/characters.js)
- [shared/kaisen-config.js](../shared/kaisen-config.js)

Define por personaje:

- nombre
- handle
- prompt de sistema
- provider preferido
- modelo por provider
- temperatura
- cooldown
- keywords
- sesgo de delay
- color y avatar de UI

### 4. Orquestador

- [src/services/orchestrator.js](../src/services/orchestrator.js)

Responsabilidades:

- normalizar el request
- leer menciones `@nombre`
- excluir personajes silenciados
- puntuar relevancia por keywords, menciones y rotacion
- limitar la cantidad de participantes
- evitar monopolio de una sola voz
- construir la ronda secuencial

La salida del orquestador no es texto plano: devuelve una ronda con pasos, timings y orden final de agentes.

### 5. Prompting

- [src/services/prompting.js](../src/services/prompting.js)

Construye el contexto de cada turno con:

- historial reciente
- respuestas ya emitidas en la ronda actual
- personajes seleccionados
- prioridad de menciones
- instrucciones de longitud y estilo

### 6. Providers

- [src/providers/index.js](../src/providers/index.js)
- [src/lib/http.js](../src/lib/http.js)

Incluye:

- cliente unificado por provider
- timeout
- retries suaves
- fallback chain
- soporte de parseo para streaming OpenAI-compatible y NDJSON de Ollama

## Flujo completo

1. El usuario envia un mensaje.
2. El frontend manda `text`, `history` y `silencedAgents` a `POST /api/chat`.
3. El backend normaliza el payload.
4. El orquestador decide 1 a 3 participantes, salvo reglas especiales del prompt.
5. Para cada participante:
   - se construye un prompt especifico
   - se consulta el provider preferido
   - si falla, se recorre la cadena de fallback
6. El backend devuelve una ronda con `steps`.
7. El frontend reproduce la ronda con delays pseudo-humanos:
   - thinking
   - typing
   - render del mensaje

## Decisiones de producto importantes

- El backend genera el contenido; el frontend controla el tempo visual.
- Solo un personaje aparece escribiendo a la vez.
- El chat no intenta simular paralelismo caotico.
- El historial es corto y controlado para evitar ruido y gasto de tokens.
- No hay persistencia backend en esta etapa.

## Limpieza respecto al proyecto anterior

Kaisen reemplaza por completo la arquitectura previa. Se eliminaron:

- observabilidad pasiva
- reportes tecnicos
- fingerprints
- diagnosticos de red
- mongo y mongoose
- socket.io
- hooks externos
- logging invasivo
