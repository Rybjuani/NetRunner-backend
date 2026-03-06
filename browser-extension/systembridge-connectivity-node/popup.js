const connectionBadge = document.getElementById("connectionBadge");
const nodeIdEl = document.getElementById("nodeId");
const socketIdEl = document.getElementById("socketId");
const assistantToggle = document.getElementById("assistantToggle");
const statusMsg = document.getElementById("statusMsg");

function renderConnection(isConnected) {
  connectionBadge.textContent = isConnected ? "Conectado" : "Desconectado";
  connectionBadge.className = `badge ${isConnected ? "ok" : "off"}`;
}

function setStatus(text) {
  statusMsg.textContent = text;
}

async function refreshStatus() {
  const response = await chrome.runtime.sendMessage({ type: "SYSTEMBRIDGE_STATUS" });
  if (!response?.ok) {
    renderConnection(false);
    setStatus(response?.error || "No se pudo obtener estado.");
    return;
  }
  renderConnection(Boolean(response.connected));
  nodeIdEl.textContent = response.nodeId || "-";
  socketIdEl.textContent = response.socketId || "-";
  assistantToggle.checked = Boolean(response.assistantActive);
  setStatus(`Servidor: ${response.serverUrl}`);
}

assistantToggle.addEventListener("change", async () => {
  const enabled = assistantToggle.checked;
  const response = await chrome.runtime.sendMessage({
    type: "SYSTEMBRIDGE_SET_ASSISTANT_MODE",
    enabled
  });
  if (!response?.ok) {
    assistantToggle.checked = !enabled;
    setStatus(response?.error || "No se pudo aplicar el cambio.");
    return;
  }
  setStatus(enabled ? "Modo asistente activado." : "Modo asistente desactivado.");
});

refreshStatus();
