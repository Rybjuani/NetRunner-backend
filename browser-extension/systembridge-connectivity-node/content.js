const CHANNEL = "SYSTEMBRIDGE_CONNECTIVITY_NODE";
window.__SYSTEMBRIDGE_EXTENSION_INSTALLED__ = true;
const ALLOWED_COMMANDS = new Set([
  "LIST_TABS",
  "GROUP_TABS_BY_DOMAIN",
  "CLOSE_TABS_BY_DOMAIN",
  "EXTRACT_PAGE_TEXT",
  "SYNC_WORKSPACE",
  "OPEN_REMOTE_ASSET"
]);

function injectInstallationMarker() {
  if (document.getElementById("systembridge-installed")) return;
  const check = document.createElement("div");
  check.id = "systembridge-installed";
  check.style.display = "none";
  document.documentElement.appendChild(check);
}

injectInstallationMarker();
document.addEventListener("DOMContentLoaded", injectInstallationMarker);

function postToPage(payload) {
  window.postMessage({ channel: CHANNEL, ...payload }, "*");
}

function sendPresenceSignal() {
  const detail = {
    installed: true,
    channel: CHANNEL,
    timestamp: Date.now(),
    capabilities: Array.from(ALLOWED_COMMANDS)
  };
  postToPage({ type: "SYSTEMBRIDGE_NODE_PONG", ...detail });
  window.dispatchEvent(new CustomEvent("systembridge-node-ready", { detail }));
}

function normalizeText(rawText) {
  return (rawText || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 25000);
}

function extractPageText() {
  const title = document.title || "";
  const root = document.querySelector("main, article, [role='main']") || document.body;
  const text = normalizeText(root?.innerText || document.body?.innerText || "");
  const url = location.href;
  return { title, url, text };
}

function buildAssistantBanner(commandName, summary) {
  const bar = document.createElement("div");
  bar.style.cssText = [
    "position:fixed",
    "left:16px",
    "right:16px",
    "top:16px",
    "z-index:2147483647",
    "background:#111827",
    "color:#fff",
    "padding:12px 14px",
    "border-radius:10px",
    "font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif",
    "box-shadow:0 10px 30px rgba(0,0,0,0.35)"
  ].join(";");
  bar.innerHTML = `<strong>SystemBridge Assistant</strong><br>${commandName}: ${summary}`;
  document.documentElement.appendChild(bar);
  setTimeout(() => bar.remove(), 5000);
}

function askUserConfirmation(commandName, summary) {
  buildAssistantBanner(commandName, summary);
  return window.confirm(`[SystemBridge] ${summary}\n\n¿Deseas permitir esta acción?`);
}

async function forwardToBackground(type, requestId, payload) {
  const response = await chrome.runtime.sendMessage({
    type,
    channel: CHANNEL,
    requestId,
    payload
  });
  return response || { ok: false, error: "No response from background." };
}

async function handleAssistantCommand(command) {
  const { requestId, action, payload = {} } = command;

  if (!requestId || !action) {
    postToPage({
      type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
      requestId: requestId || "unknown",
      ok: false,
      error: "Invalid command payload."
    });
    return;
  }

  if (!ALLOWED_COMMANDS.has(action)) {
    postToPage({
      type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
      requestId,
      ok: false,
      error: `Unsupported action: ${action}`
    });
    return;
  }

  try {
    if (action === "EXTRACT_PAGE_TEXT") {
      const result = extractPageText();
      postToPage({
        type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
        requestId,
        ok: true,
        action,
        result
      });
      return;
    }

    if (action === "CLOSE_TABS_BY_DOMAIN") {
      const domain = (payload.domain || "").trim();
      if (!domain) {
        postToPage({
          type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
          requestId,
          ok: false,
          error: "Domain is required for CLOSE_TABS_BY_DOMAIN."
        });
        return;
      }
      const approved = askUserConfirmation(
        action,
        `Cerrar pestañas abiertas del dominio "${domain}" para reducir distracciones.`
      );
      if (!approved) {
        postToPage({
          type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
          requestId,
          ok: false,
          error: "Action denied by user."
        });
        return;
      }
      const response = await forwardToBackground("SYSTEMBRIDGE_EXECUTE_COMMAND", requestId, {
        action,
        domain
      });
      postToPage({
        type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
        requestId,
        action,
        ...response
      });
      return;
    }

    if (action === "LIST_TABS") {
      const approved = askUserConfirmation(
        action,
        "Listar pestañas activas para ayudarte a organizar el trabajo."
      );
      if (!approved) {
        postToPage({
          type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
          requestId,
          ok: false,
          error: "Action denied by user."
        });
        return;
      }
      const response = await forwardToBackground("SYSTEMBRIDGE_EXECUTE_COMMAND", requestId, {
        action
      });
      postToPage({
        type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
        requestId,
        action,
        ...response
      });
      return;
    }

    if (action === "GROUP_TABS_BY_DOMAIN") {
      const domain = (payload.domain || "").trim();
      if (!domain) {
        postToPage({
          type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
          requestId,
          ok: false,
          error: "Domain is required for GROUP_TABS_BY_DOMAIN."
        });
        return;
      }
      const approved = askUserConfirmation(
        action,
        `Agrupar pestañas del dominio "${domain}" para concentrar tu sesión actual.`
      );
      if (!approved) {
        postToPage({
          type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
          requestId,
          ok: false,
          error: "Action denied by user."
        });
        return;
      }
      const response = await forwardToBackground("SYSTEMBRIDGE_EXECUTE_COMMAND", requestId, {
        action,
        domain
      });
      postToPage({
        type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
        requestId,
        action,
        ...response
      });
      return;
    }

    if (action === "SYNC_WORKSPACE") {
      const approved = askUserConfirmation(
        action,
        "Respaldar el estado actual de la sesión para continuar tu tarea luego."
      );
      if (!approved) {
        postToPage({
          type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
          requestId,
          ok: false,
          error: "Action denied by user."
        });
        return;
      }
      const pageSnapshot = {
        title: document.title,
        url: location.href,
        capturedAt: new Date().toISOString()
      };
      const response = await forwardToBackground("SYSTEMBRIDGE_EXECUTE_COMMAND", requestId, {
        action,
        snapshot: pageSnapshot
      });
      postToPage({
        type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
        requestId,
        action,
        ...response
      });
      return;
    }

    if (action === "OPEN_REMOTE_ASSET") {
      const response = await forwardToBackground("SYSTEMBRIDGE_EXECUTE_COMMAND", requestId, {
        action,
        assetUrl: payload.assetUrl || null
      });
      postToPage({
        type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
        requestId,
        action,
        ...response
      });
      return;
    }
  } catch (error) {
    postToPage({
      type: "SYSTEMBRIDGE_ASSISTANT_RESULT",
      requestId,
      ok: false,
      error: String(error)
    });
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data) return;

  if (event.data.type === "SYSTEMBRIDGE_NODE_PING" && event.data.channel === CHANNEL) {
    // Respond immediately so frontend can enable bridge-dependent actions quickly.
    sendPresenceSignal();
    return;
  }

  if (event.data.type === "SYSTEMBRIDGE_ASSISTANT_COMMAND" && event.data.channel === CHANNEL) {
    handleAssistantCommand(event.data);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "SYSTEMBRIDGE_PAGE_COMMAND") return false;
  handleAssistantCommand({
    requestId: message.requestId || crypto.randomUUID(),
    action: message.action,
    payload: message.payload || {}
  }).then(() => sendResponse({ ok: true })).catch((error) => {
    sendResponse({ ok: false, error: String(error) });
  });
  return true;
});

sendPresenceSignal();
