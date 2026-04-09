# Deploy y operacion

## Variables de entorno

Kaisen usa estas variables y no cambia sus nombres:

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

## Railway

### Build

```bash
npm run install:prod
```

### Start

```bash
npm start
```

## Comportamiento operativo

- Si un provider preferido falla, el sistema prueba el siguiente segun el orden global.
- Si faltan todas las credenciales, la app sigue arrancando.
- En ese caso, `POST /api/chat` devuelve `503` con un mensaje claro.
- `GET /api/health` sigue siendo util para validar deploy, roster y variables efectivas.
- Los errores visibles del backend quedaron localizados en español.

## Recomendaciones

- Mantener `CHAT_MAX_PARALLEL_AGENTS=3` para evitar ruido y gasto de tokens.
- Mantener `CHAT_MAX_ROUND_TURNS=6` como limite fuerte anti-loop.
- Si el streaming da problemas con un provider, la app sigue siendo funcional porque el tempo final lo controla el frontend.

## Local

```bash
npm install
npm run dev
npm run test:smoke
```

## Publicacion de assets

Los avatares actuales estan en:

- [public/avatars/gojo.png](../public/avatars/gojo.png)
- [public/avatars/itadori.png](../public/avatars/itadori.png)
- [public/avatars/mahito.png](../public/avatars/mahito.png)
- [public/avatars/megumi.png](../public/avatars/megumi.png)
- [public/avatars/sukuna.png](../public/avatars/sukuna.png)
- [public/avatars/todo.png](../public/avatars/todo.png)

Pueden reemplazarse sin tocar codigo mientras mantengas los nombres y rutas.
