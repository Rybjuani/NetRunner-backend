export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function extractJsonTextCandidate(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item?.text === "string") return item.text;
        if (typeof item?.content === "string") return item.content;
        return "";
      })
      .join("");
  }
  return "";
}

export function extractAssistantText(payload) {
  return (
    extractJsonTextCandidate(payload?.choices?.[0]?.message?.content) ||
    extractJsonTextCandidate(payload?.message?.content) ||
    extractJsonTextCandidate(payload?.response?.output_text) ||
    extractJsonTextCandidate(payload?.output_text) ||
    ""
  );
}

export async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function readOpenAiCompatibleStream(response) {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let buffered = "";
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffered += decoder.decode(value, { stream: true });
    const chunks = buffered.split("\n\n");
    buffered = chunks.pop() || "";

    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const delta =
            parsed?.choices?.[0]?.delta?.content ||
            parsed?.choices?.[0]?.message?.content ||
            "";
          content += extractJsonTextCandidate(delta);
        } catch {
          continue;
        }
      }
    }
  }

  return content.trim();
}

export async function readNdjsonStream(response) {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let buffered = "";
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      try {
        const parsed = JSON.parse(line);
        content += extractJsonTextCandidate(parsed?.message?.content);
      } catch {
        continue;
      }
    }
  }

  if (buffered.trim()) {
    try {
      const parsed = JSON.parse(buffered.trim());
      content += extractJsonTextCandidate(parsed?.message?.content);
    } catch {
      // Ignore malformed trailing chunk.
    }
  }

  return content.trim();
}
