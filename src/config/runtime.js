const SUPPORTED_PROVIDERS = ["groq", "ollama", "zen"];

function toInteger(value, fallback, min = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeProviderName(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return SUPPORTED_PROVIDERS.includes(normalized) ? normalized : fallback;
}

const DEFAULT_PROVIDER = normalizeProviderName(process.env.DEFAULT_PROVIDER, "groq");
const FALLBACK_PROVIDER = normalizeProviderName(process.env.FALLBACK_PROVIDER, "ollama");
const SECONDARY_PROVIDER = normalizeProviderName(process.env.SECONDARY_PROVIDER, "zen");

export const runtime = {
  appName: "Kaisen",
  host: "0.0.0.0",
  port: toInteger(process.env.PORT, 8080, 1),
  providerOrder: [DEFAULT_PROVIDER, FALLBACK_PROVIDER, SECONDARY_PROVIDER],
  providers: {
    groq: {
      name: "groq",
      label: "Groq",
      apiKey: process.env.GROQ_API_KEY || "",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
    },
    ollama: {
      name: "ollama",
      label: "Ollama",
      apiKey: process.env.OLLAMA_API_KEY || "",
      endpoint: "https://ollama.com/api/chat",
    },
    zen: {
      name: "zen",
      label: "OpenCode Zen",
      apiKey: process.env.OPENCODE_ZEN_API_KEY || "",
      endpoint: "https://opencode.ai/zen/v1/chat/completions",
    },
  },
  chat: {
    maxParallelAgents: Math.min(toInteger(process.env.CHAT_MAX_PARALLEL_AGENTS, 3, 1), 3),
    maxRoundTurns: Math.min(toInteger(process.env.CHAT_MAX_ROUND_TURNS, 6, 1), 6),
    requestTimeoutMs: toInteger(process.env.CHAT_REQUEST_TIMEOUT_MS, 45000, 5000),
    enableStream: toBoolean(process.env.CHAT_ENABLE_STREAM, true),
    historyWindow: 18,
    retryCount: 2,
    initialDelayMs: { min: 2500, max: 5500 },
    betweenDelayMs: { min: 1800, max: 4500 },
  },
};

export function isProviderConfigured(providerName) {
  return Boolean(runtime.providers[providerName]?.apiKey);
}

export function getProviderOrder(preferredProvider) {
  return [...new Set([preferredProvider, ...runtime.providerOrder])].filter((providerName) =>
    SUPPORTED_PROVIDERS.includes(providerName),
  );
}

export function getPublicRuntimeConfig() {
  return {
    providers: Object.fromEntries(
      Object.entries(runtime.providers).map(([providerName, config]) => [
        providerName,
        {
          configured: Boolean(config.apiKey),
          label: config.label,
        },
      ]),
    ),
    providerOrder: runtime.providerOrder,
    chat: {
      maxParallelAgents: runtime.chat.maxParallelAgents,
      maxRoundTurns: runtime.chat.maxRoundTurns,
      requestTimeoutMs: runtime.chat.requestTimeoutMs,
      enableStream: runtime.chat.enableStream,
    },
  };
}
