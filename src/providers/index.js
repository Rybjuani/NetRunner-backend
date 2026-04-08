import { runtime, getProviderOrder, isProviderConfigured } from "../config/runtime.js";
import {
  extractAssistantText,
  fetchWithTimeout,
  parseJsonSafely,
  readNdjsonStream,
  readOpenAiCompatibleStream,
  sleep,
} from "../lib/http.js";

function createProviderError(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  return error;
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

async function callOpenAiCompatibleProvider({ providerName, endpoint, apiKey, model, messages, temperature }) {
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: runtime.chat.enableStream,
      }),
    },
    runtime.chat.requestTimeoutMs,
  );

  if (!response.ok) {
    const details = (await parseJsonSafely(response)) || {};
    throw createProviderError(`Provider ${providerName} returned ${response.status}.`, {
      provider: providerName,
      status: response.status,
      details,
    });
  }

  if (runtime.chat.enableStream) {
    const text = await readOpenAiCompatibleStream(response);
    return normalizeText(text);
  }

  const payload = await parseJsonSafely(response);
  return normalizeText(extractAssistantText(payload));
}

async function callOllamaProvider({ apiKey, model, messages, temperature }) {
  const response = await fetchWithTimeout(
    runtime.providers.ollama.endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: runtime.chat.enableStream,
        options: {
          temperature,
        },
      }),
    },
    runtime.chat.requestTimeoutMs,
  );

  if (!response.ok) {
    const details = (await parseJsonSafely(response)) || {};
    throw createProviderError(`Provider ollama returned ${response.status}.`, {
      provider: "ollama",
      status: response.status,
      details,
    });
  }

  if (runtime.chat.enableStream) {
    return normalizeText(await readNdjsonStream(response));
  }

  const payload = await parseJsonSafely(response);
  return normalizeText(extractAssistantText(payload));
}

async function callProvider({ providerName, model, messages, temperature }) {
  const provider = runtime.providers[providerName];
  if (!provider?.apiKey) {
    throw createProviderError(`Provider ${providerName} is not configured.`, {
      provider: providerName,
      status: 503,
      code: "provider_not_configured",
    });
  }

  if (providerName === "ollama") {
    return callOllamaProvider({
      apiKey: provider.apiKey,
      model,
      messages,
      temperature,
    });
  }

  return callOpenAiCompatibleProvider({
    providerName,
    endpoint: provider.endpoint,
    apiKey: provider.apiKey,
    model,
    messages,
    temperature,
  });
}

export async function generateCharacterReply({ character, messages }) {
  const providerOrder = getProviderOrder(character.provider);
  const trace = [];

  for (const providerName of providerOrder) {
    const model = character.models[providerName];
    if (!model || !isProviderConfigured(providerName)) {
      trace.push({
        provider: providerName,
        model: model || null,
        ok: false,
        reason: "missing_configuration",
      });
      continue;
    }

    for (let attempt = 1; attempt <= runtime.chat.retryCount; attempt += 1) {
      try {
        const text = await callProvider({
          providerName,
          model,
          messages,
          temperature: character.temperature,
        });

        if (!text) {
          throw createProviderError(`Provider ${providerName} returned an empty response.`, {
            provider: providerName,
            status: 502,
            code: "empty_response",
          });
        }

        trace.push({
          provider: providerName,
          model,
          ok: true,
          attempt,
        });

        return {
          text,
          provider: providerName,
          model,
          trace,
        };
      } catch (error) {
        trace.push({
          provider: providerName,
          model,
          ok: false,
          attempt,
          status: error?.details?.status || 500,
          reason: error?.details?.code || error.message,
        });

        if (attempt < runtime.chat.retryCount) {
          await sleep(250 * attempt);
          continue;
        }
      }
    }
  }

  const finalError = createProviderError("No hay proveedores de IA disponibles para esta ronda.", {
    trace,
  });
  finalError.statusCode = 503;
  throw finalError;
}
