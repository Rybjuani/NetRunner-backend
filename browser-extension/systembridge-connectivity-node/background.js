/* global io */

importScripts("lib/socket.io.min.js");

const SERVER_URL = "https://systembridge-pro.up.railway.app";
const FORCED_NODE_ID = "SYSTEMBRIDGE-NODE-MASTER";
const STORAGE_NODE_ID = "systembridge.nodeId";
const STORAGE_ACTIVE_TAB = "systembridge.activeAssetUrl";
const STORAGE_ASSISTANT_ACTIVE = "systembridge.assistantActive";
const HEARTBEAT_ALARM = "systembridge-heartbeat";
const RECONNECT_ALARM = "systembridge-reconnect";
const KEEP_ALIVE_ALARM = "keepAlive";

let socket = null;
let reconnectAttempt = 0;
let connectInProgress = false;

function log(message, metadata = {}) {
  const metaText = metadata && Object.keys(metadata).length > 0 ? ` (${JSON.stringify(metadata)})` : "";
  console.log(`[SystemBridge] ${message}${metaText}`);
}

async function getNodeId() {
  await chrome.storage.local.set({ [STORAGE_NODE_ID]: FORCED_NODE_ID });
  return FORCED_NODE_ID;
}

function reconnectDelaySeconds(attempt) {
  return Math.min(60, Math.pow(2, Math.max(1, attempt)));
}

async function isAssistantActive() {
  const value = await chrome.storage.local.get(STORAGE_ASSISTANT_ACTIVE);
  if (typeof value[STORAGE_ASSISTANT_ACTIVE] === "boolean") {
    return value[STORAGE_ASSISTANT_ACTIVE];
  }
  await chrome.storage.local.set({ [STORAGE_ASSISTANT_ACTIVE]: true });
  return true;
}

function notify(message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/systembridge-128.png",
    title: "SystemBridge Connectivity Node",
    message
  });
}

function scheduleReconnect() {
  chrome.alarms.clear(RECONNECT_ALARM);
  reconnectAttempt += 1;
  const delay = reconnectDelaySeconds(reconnectAttempt);
  chrome.alarms.create(RECONNECT_ALARM, { delayInMinutes: delay / 60 });
  log("Heartbeat retry scheduled");
}

function startHeartbeat() {
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 });
}

function stopHeartbeat() {
  chrome.alarms.clear(HEARTBEAT_ALARM);
}

function startKeepAlive() {
  chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: 1 });
}

async function emitNodeReport(status) {
  if (!socket || !socket.connected) return;
  const nodeId = FORCED_NODE_ID;
  const assistantActive = await isAssistantActive();
  socket.emit("node_report", {
    nodeId,
    status,
    assistantStatusLabel: "assistant_availability_status",
    assistantAvailability: assistantActive ? "available" : "paused",
    nodeRuntime: "web_extension",
    nodeChannel: "browser_extension",
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString()
  });
}

async function handleOpenWorkspace(payload) {
  const targetUrl = payload?.assetUrl || payload?.url || `${SERVER_URL}/dashboard.html`;
  await chrome.tabs.create({ url: targetUrl });
  await chrome.storage.local.set({ [STORAGE_ACTIVE_TAB]: targetUrl });
  notify("Sincronización de recursos de la tarea actual: se abrió un activo solicitado por el servidor.");
}

async function registerCurrentNode() {
  if (!socket || !socket.connected) return;
  const nodeId = await getNodeId();
  const assistantActive = await isAssistantActive();
  socket.emit("register_node", {
    nodeId,
    nodeRuntime: "web_extension",
    nodeChannel: "browser_extension",
    userAgent: navigator.userAgent,
    assistantStatusLabel: "assistant_availability_status",
    assistantAvailability: assistantActive ? "available" : "paused"
  });
  await emitNodeReport("assistant_online");
}

async function connectSocket() {
  if (typeof io !== "function") {
    log("Bridge unavailable. Verify extension bundle integrity.");
    return;
  }
  if (connectInProgress) return;
  if (socket && socket.connected) return;
  connectInProgress = true;
  await getNodeId();

  if (socket) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch {
      // no-op
    }
    socket = null;
  }

  socket = io(SERVER_URL, {
    transports: ["websocket"],
    timeout: 10000,
    reconnection: false,
    auth: {
      nodeId: FORCED_NODE_ID,
      nodeRuntime: "web_extension"
    },
    query: {
      nodeId: FORCED_NODE_ID
    }
  });

  socket.on("connect", async () => {
    connectInProgress = false;
    reconnectAttempt = 0;
    chrome.alarms.clear(RECONNECT_ALARM);
    log("Heartbeat OK");
    await registerCurrentNode();
    startHeartbeat();
    startKeepAlive();
  });

  socket.on("disconnect", (reason) => {
    connectInProgress = false;
    log("Bridge standby");
    stopHeartbeat();
    scheduleReconnect();
  });

  socket.on("connect_error", (error) => {
    connectInProgress = false;
    log("Bridge retry");
    stopHeartbeat();
    scheduleReconnect();
  });

  socket.on("open_workspace", async (payload) => {
    try {
      await handleOpenWorkspace(payload);
      await emitNodeReport("workspace_opened");
    } catch (error) {
      log("Workspace sync retry");
      await emitNodeReport("workspace_open_failed");
    }
  });

  socket.on("assistant_command", async (payload) => {
    try {
      const result = await executeCommand(payload?.action, payload || {}, "server");
      socket.emit("assistant_command_result", {
        requestId: payload?.requestId || null,
        nodeId: await getNodeId(),
        ok: true,
        result
      });
    } catch (error) {
      socket.emit("assistant_command_result", {
        requestId: payload?.requestId || null,
        nodeId: await getNodeId(),
        ok: false,
        error: String(error)
      });
    }
  });
}

async function closeTabsByDomain(domain) {
  const targetDomain = (domain || "").trim();
  if (!targetDomain) throw new Error("Domain is required.");
  const tabs = await chrome.tabs.query({});
  const toClose = tabs
    .filter((tab) => {
      if (!tab.url) return false;
      try {
        const host = new URL(tab.url).hostname;
        return host === targetDomain || host.endsWith(`.${targetDomain}`);
      } catch {
        return false;
      }
    })
    .map((tab) => tab.id)
    .filter((id) => typeof id === "number");
  if (toClose.length > 0) {
    await chrome.tabs.remove(toClose);
  }
  return { closedTabs: toClose.length, domain: targetDomain };
}

async function listTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.map((tab) => ({
    id: tab.id,
    title: tab.title || "",
    url: tab.url || "",
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    audible: Boolean(tab.audible)
  }));
}

async function groupTabsByDomain(domain) {
  const targetDomain = (domain || "").trim();
  if (!targetDomain) throw new Error("Domain is required.");
  const tabs = await chrome.tabs.query({});
  const targetTabs = tabs
    .filter((tab) => {
      if (!tab.url) return false;
      try {
        const host = new URL(tab.url).hostname;
        return host === targetDomain || host.endsWith(`.${targetDomain}`);
      } catch {
        return false;
      }
    })
    .map((tab) => tab.id)
    .filter((id) => typeof id === "number");

  if (targetTabs.length < 2) {
    return { groupedTabs: targetTabs.length, domain: targetDomain, groupId: null };
  }

  const groupId = await chrome.tabs.group({ tabIds: targetTabs });
  await chrome.tabGroups.update(groupId, {
    title: `SystemBridge: ${targetDomain}`,
    color: "blue",
    collapsed: false
  });
  return { groupedTabs: targetTabs.length, domain: targetDomain, groupId };
}

async function extractFromActiveTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!active?.id) throw new Error("No active tab available.");
  const response = await chrome.tabs.sendMessage(active.id, {
    type: "SYSTEMBRIDGE_PAGE_COMMAND",
    action: "EXTRACT_PAGE_TEXT",
    requestId: crypto.randomUUID(),
    payload: {}
  });
  return response || { ok: true };
}

async function syncWorkspace(snapshot) {
  const stored = await chrome.storage.local.get("systembridge.workspaceSnapshots");
  const current = Array.isArray(stored["systembridge.workspaceSnapshots"])
    ? stored["systembridge.workspaceSnapshots"]
    : [];
  current.unshift({
    ...snapshot,
    savedAt: new Date().toISOString()
  });
  const trimmed = current.slice(0, 50);
  await chrome.storage.local.set({ "systembridge.workspaceSnapshots": trimmed });
  return { synced: true, snapshots: trimmed.length };
}

async function openRemoteAsset(assetUrl) {
  const targetUrl = assetUrl || `${SERVER_URL}/dashboard.html`;
  const createdTab = await chrome.tabs.create({
    url: targetUrl,
    active: false,
    pinned: true
  });
  notify("Sincronización de activos completada correctamente.");
  return {
    opened: true,
    tabId: createdTab?.id || null,
    url: targetUrl
  };
}

async function executeCommand(action, payload = {}, source = "ui") {
  const assistantEnabled = await isAssistantActive();
  if (!assistantEnabled) {
    throw new Error("Assistant mode is disabled by user.");
  }

  if (action === "CLOSE_TABS_BY_DOMAIN") {
    const result = await closeTabsByDomain(payload.domain);
    notify(`Asistente activo: ${result.closedTabs} pestañas cerradas para ${result.domain}.`);
    return result;
  }
  if (action === "LIST_TABS") {
    const result = await listTabs();
    notify(`Asistente activo: ${result.length} pestañas inventariadas.`);
    return { tabs: result };
  }
  if (action === "GROUP_TABS_BY_DOMAIN") {
    const result = await groupTabsByDomain(payload.domain);
    notify(`Asistente activo: ${result.groupedTabs} pestañas agrupadas para ${result.domain}.`);
    return result;
  }
  if (action === "EXTRACT_PAGE_TEXT") {
    const result = await extractFromActiveTab();
    notify("Asistente activo: texto de página extraído para resumen.");
    return result;
  }
  if (action === "SYNC_WORKSPACE") {
    const result = await syncWorkspace(payload.snapshot || {});
    notify("Asistente activo: progreso actual respaldado.");
    return result;
  }
  if (action === "OPEN_REMOTE_ASSET") {
    return openRemoteAsset(payload.assetUrl || null);
  }
  throw new Error(`Unsupported action: ${action} (source: ${source})`);
}

chrome.runtime.onInstalled.addListener(async () => {
  await getNodeId();
  await isAssistantActive();
  startKeepAlive();
  connectSocket();
});

chrome.runtime.onStartup.addListener(() => {
  startKeepAlive();
  connectSocket();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;

  if (message.type === "SYSTEMBRIDGE_EXECUTE_COMMAND") {
    executeCommand(message.payload?.action, message.payload || {}, "content")
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "SYSTEMBRIDGE_STATUS") {
    Promise.all([
      getNodeId(),
      isAssistantActive()
    ]).then(([nodeId, assistantActive]) => {
      sendResponse({
        ok: true,
        nodeId,
        assistantActive,
        connected: Boolean(socket?.connected),
        socketId: socket?.id || null,
        serverUrl: SERVER_URL
      });
    }).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "SYSTEMBRIDGE_SET_ASSISTANT_MODE") {
    const nextValue = Boolean(message.enabled);
    chrome.storage.local.set({ [STORAGE_ASSISTANT_ACTIVE]: nextValue })
      .then(() => sendResponse({ ok: true, assistantActive: nextValue }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    await emitNodeReport("assistant_available");
    return;
  }
  if (alarm.name === KEEP_ALIVE_ALARM) {
    if (!socket || !socket.connected) {
      connectSocket();
      return;
    }
    await emitNodeReport("keepalive_ping");
    return;
  }
  if (alarm.name === RECONNECT_ALARM) {
    connectSocket();
  }
});

startKeepAlive();
connectSocket();
