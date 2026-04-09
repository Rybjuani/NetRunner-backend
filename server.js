import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { APP_META } from "./shared/kaisen-config.js";
import { CHARACTERS } from "./src/config/characters.js";
import { createRoundtableConversation, sanitizeChatRequest } from "./src/services/orchestrator.js";
import { getPublicRuntimeConfig, runtime } from "./src/config/runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, "public");
const sharedPath = path.join(__dirname, "shared");

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use(express.static(publicPath, { maxAge: "5m" }));
app.use("/shared", express.static(sharedPath, { maxAge: "5m" }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: APP_META.name,
    mode: "roundtable",
    runtime: getPublicRuntimeConfig(),
    roster: CHARACTERS.map((character) => ({
      id: character.id,
      name: character.name,
      provider: character.provider,
      model: character.models[character.provider],
    })),
  });
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const payload = sanitizeChatRequest(req.body);
    const result = await createRoundtableConversation(payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Ruta no encontrada." });
  }

  return res.status(404).send("Ruta no encontrada.");
});

app.use((error, _req, res, _next) => {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const message = status === 503 || status < 500 ? error.message : "Error interno del servidor.";

  if (status >= 500 && status !== 503) {
    console.error("[kaisen] unhandled error:", error);
  }

  res.status(status).json({ error: message });
});

const server = app.listen(runtime.port, runtime.host, () => {
  console.log(`[kaisen] listening on ${runtime.host}:${runtime.port}`);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[kaisen] received ${signal}, shutting down`);

  await new Promise((resolve) => {
    server.close(() => resolve());
  });

  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    console.error("[kaisen] shutdown error:", error);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    console.error("[kaisen] shutdown error:", error);
    process.exit(1);
  });
});
