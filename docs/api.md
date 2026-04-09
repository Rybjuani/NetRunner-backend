# API de Kaisen

## Base URL

- Local: `http://localhost:8080`
- Railway: la URL publica de tu deploy

## GET /api/health

Devuelve estado basico de la app y configuracion publica.

### Respuesta

```json
{
  "ok": true,
  "app": "Kaisen",
  "mode": "roundtable",
  "runtime": {
    "providers": {
      "groq": { "configured": true, "label": "Groq" },
      "ollama": { "configured": true, "label": "Ollama" },
      "zen": { "configured": true, "label": "OpenCode Zen" }
    },
    "providerOrder": ["groq", "ollama", "zen"],
    "chat": {
      "maxParallelAgents": 3,
      "maxRoundTurns": 6,
      "requestTimeoutMs": 45000,
      "enableStream": true
    }
  },
  "roster": [
    {
      "id": "gojo",
      "name": "Gojo",
      "provider": "groq",
      "model": "llama-3.3-70b-versatile"
    }
  ]
}
```

## POST /api/chat

Genera una nueva ronda de conversacion.

### Request body

```json
{
  "text": "Gojo y Megumi, comparen dos estrategias para resolver esto",
  "history": [
    {
      "role": "user",
      "text": "Necesito ayuda con una decision dificil"
    },
    {
      "role": "agent",
      "speakerId": "itadori",
      "text": "Primero miremos lo humano del problema"
    }
  ],
  "silencedAgents": ["mahito"]
}
```

### Reglas de entrada

- `text` es obligatorio.
- `history` es opcional y se recorta del lado servidor.
- `silencedAgents` es opcional.
- Los personajes pueden detectarse por nombre, alias o `@nombre`.
- Si el usuario le habla claramente a un personaje, ese personaje queda como owner de la respuesta principal y responde primero.
- Si el siguiente mensaje del usuario es un follow-up corto sin nuevo nombre, el backend puede mantener el mismo foco conversacional.

### Respuesta exitosa

```json
{
  "roundId": "uuid",
  "selectedAgentIds": ["gojo", "megumi"],
  "queueAgentIds": ["gojo", "megumi"],
  "references": {
    "all": ["gojo", "megumi"]
  },
  "steps": [
    {
      "id": "uuid",
      "agentId": "gojo",
      "text": "respuesta del personaje",
      "provider": "groq",
      "model": "llama-3.3-70b-versatile",
      "timing": {
        "thinkingMs": 2140,
        "typingMs": 1860
      },
      "fallbackTrace": []
    }
  ]
}
```

## Errores esperables

### 400

- mensaje vacio
- todos los personajes silenciados

### 503

- no hay providers configurados
- los providers fallaron o agotaron fallback
- el personaje foco no pudo responder primero

### 404

- endpoint inexistente
- errores devueltos en español

## Endpoints eliminados

Kaisen no expone:

- `/api/telemetry`
- `/api/report`
- ningun endpoint de diagnostico o persistencia tecnica
