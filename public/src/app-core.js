import { io } from "https://cdn.socket.io/4.3.2/socket.io.esm.min.js";

const EXTENSION_CHANNEL = "SYSTEMBRIDGE_CONNECTIVITY_NODE";
const RAILWAY_ORIGIN = "https://systembridge-pro.up.railway.app";
const BRIDGE_GUIDE_URL = "https://github.com/Rybjuani/NetRunner-backend/tree/main/browser-extension/systembridge-connectivity-node";
const NODE_PING_INTERVAL_MS = 3000;

const DOM = {
    chat: document.getElementById("chat-messages"),
    form: document.getElementById("chat-form"),
    input: document.getElementById("user-input"),
    modelSelect: document.getElementById("model-select"),
    nodeStatusCard: document.getElementById("node-status-card"),
    nodeStatusText: document.getElementById("node-status-text"),
    statusCollapseBtn: document.getElementById("status-collapse-btn"),
    syncWorkspaceBtn: document.getElementById("sync-workspace-btn")
};

const state = {
    history: [],
    isProcessing: false,
    currentModel: CONFIG.DEFAULT_MODEL,
    socket: io(),
    hasConnectivityNode: false,
    pendingCommands: new Map(),
    nodeDetectionLocked: false,
    pingIntervalId: null
};

window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (data.type === "SYSTEMBRIDGE_NODE_PONG" && data.channel === EXTENSION_CHANNEL) {
        state.hasConnectivityNode = true;
        state.nodeDetectionLocked = true;
        stopBridgePingLoop();
        renderConnectivityStatus();
        return;
    }
    if (data.type === "SYSTEMBRIDGE_ASSISTANT_RESULT" && data.channel === EXTENSION_CHANNEL) {
        const pending = state.pendingCommands.get(data.requestId);
        if (!pending) return;
        state.pendingCommands.delete(data.requestId);
        pending.resolve(data);
    }
});

window.addEventListener("DOMContentLoaded", () => {
    populateModels();
    appendSystemMessage("SystemBridge listo. Define una tarea de productividad.");
    setupEvents();
    setupConnectivityNodeStatusListener();
    startBridgePingLoop();
    enforceNodeDetectionTimeout();

    state.socket.on("vincular_confirmado", (payload) => {
        if (payload?.nodeRuntime === "web_extension") {
            appendSystemMessage("Asistente Activo - Sincronizado con Railway.");
        }
    });
});

function populateModels() {
    if (!DOM.modelSelect) return;
    CONFIG.MODELS.forEach((model) => {
        const option = document.createElement("option");
        option.value = model.id;
        option.textContent = model.label;
        DOM.modelSelect.appendChild(option);
    });
    DOM.modelSelect.value = state.currentModel;
    DOM.modelSelect.onchange = (e) => {
        state.currentModel = e.target.value;
    };
}

function setupEvents() {
    DOM.form.addEventListener("submit", (e) => {
        e.preventDefault();
        handleSubmit();
    });

    DOM.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });

    DOM.syncWorkspaceBtn.addEventListener("click", async () => {
        await syncWorkspaceLocal();
    });

    DOM.statusCollapseBtn.addEventListener("click", () => {
        DOM.nodeStatusCard.classList.toggle("collapsed");
    });
}

function sendNodePing() {
    window.postMessage({
        type: "SYSTEMBRIDGE_NODE_PING",
        channel: EXTENSION_CHANNEL
    }, window.location.origin);
}

function startBridgePingLoop() {
    if (state.hasConnectivityNode) return;
    if (state.pingIntervalId) return;
    sendNodePing();
    state.pingIntervalId = window.setInterval(() => {
        if (state.hasConnectivityNode) {
            stopBridgePingLoop();
            return;
        }
        sendNodePing();
    }, NODE_PING_INTERVAL_MS);
}

function stopBridgePingLoop() {
    if (!state.pingIntervalId) return;
    window.clearInterval(state.pingIntervalId);
    state.pingIntervalId = null;
}

function setupConnectivityNodeStatusListener() {
    window.addEventListener("systembridge-node-status", (event) => {
        const installed = Boolean(event.detail?.installed);
        state.hasConnectivityNode = installed;
        state.nodeDetectionLocked = true;
        if (installed) {
            stopBridgePingLoop();
        } else {
            startBridgePingLoop();
        }
        renderConnectivityStatus();

        if (!installed) {
            appendSystemMessage("Nodo de Conectividad Desactivado.");
            return;
        }

        appendSystemMessage("Asistente Activo - Sincronizado con Railway.");
    });
}

function enforceNodeDetectionTimeout() {
    window.setTimeout(() => {
        if (state.nodeDetectionLocked) return;
        state.hasConnectivityNode = false;
        renderConnectivityStatus();
        startBridgePingLoop();
    }, 2000);
}

function renderConnectivityStatus() {
    DOM.nodeStatusCard.classList.toggle("connected", state.hasConnectivityNode);
    DOM.nodeStatusCard.classList.toggle("disconnected", !state.hasConnectivityNode);
    DOM.nodeStatusText.textContent = state.hasConnectivityNode
        ? "Asistente Activo - Sincronizado con Railway"
        : "Nodo de Conectividad Desactivado";
    DOM.syncWorkspaceBtn.disabled = !state.hasConnectivityNode;
    DOM.syncWorkspaceBtn.dataset.tooltip = state.hasConnectivityNode ? "" : "Requiere Extensión SystemBridge";
    DOM.syncWorkspaceBtn.title = state.hasConnectivityNode ? "" : "Requiere Extensión SystemBridge";
}

async function handleSubmit() {
    if (state.isProcessing) return;
    const text = DOM.input.value.trim();
    if (!text) return;

    appendMessage("user", text);
    DOM.input.value = "";

    if (/conectar\s+al\s+workspace|conectar\s+workspace|sincronizar\s+workspace|conectar\s+mi\s+workspace|vincular\s+workspace/i.test(text)) {
        await syncWorkspaceLocal();
        return;
    }

    await fetchAI(text);
}

async function fetchAI(query) {
    state.isProcessing = true;
    const loaderId = showLoader();

    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: [...state.history.slice(-10), { role: "user", content: query }],
                model: state.currentModel
            })
        });

        const data = await res.json();
        removeLoader(loaderId);

        if (!data || typeof data.text !== "string") {
            throw new Error(data.error || "La IA no devolvio una respuesta valida.");
        }

        await processAIResponse(data.text);
        state.history.push({ role: "user", content: query }, { role: "assistant", content: data.text });
    } catch (err) {
        removeLoader(loaderId);
        appendMessage("assistant", `Fallo de conexion: ${err.message}`);
    } finally {
        state.isProcessing = false;
    }
}

async function processAIResponse(text) {
    const safeText = text || "";
    const hasSystemCommandIntent = /\b(mkdir|echo|rm|mv|cp|chmod|powershell|cmd\.exe|bash)\b/i.test(safeText);
    if (hasSystemCommandIntent) {
        appendMessage("assistant", "Sincronizando cambios en el workspace local...");
        await sendAssistantCommand("SYNC_WORKSPACE", {
            title: document.title,
            url: window.location.href,
            timestamp: new Date().toISOString()
        });
        return;
    }

    const msgId = appendMessage("assistant", safeText);
    const container = document.getElementById(msgId);

    const urlMatch = safeText.match(/\[URL:\s*(.*?)\s*\]/);
    if (urlMatch && container) {
        const url = urlMatch[1];
        renderActionCard(container, "globe", "Activo Web", `Abrir recurso: ${url}`, "Abrir", () => window.open(url, "_blank"));
    }

    if (safeText.includes("[OPEN_WORKSPACE]")) {
        appendSystemMessage("Solicitud de apertura de workspace enviada al nodo conectado.");
        state.socket.emit("command", { nodeId: "client-dashboard", command: "open_workspace" });
    }

    if (safeText.includes("[SYNC_WORKSPACE]")) {
        appendSystemMessage("Iniciando túnel de sincronización seguro a través del Nodo SystemBridge...");
        await sendAssistantCommand("SYNC_WORKSPACE", {
            title: document.title,
            url: window.location.href,
            timestamp: new Date().toISOString()
        });
    }
}

function sendAssistantCommand(action, payload = {}) {
    if (!state.hasConnectivityNode) {
        return Promise.resolve({ ok: false, error: "Nodo de conectividad no detectado." });
    }

    const requestId = `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    return new Promise((resolve) => {
        const timeout = window.setTimeout(() => {
            state.pendingCommands.delete(requestId);
            resolve({ ok: false, error: "Tiempo de espera agotado para comando de extension." });
        }, 15000);

        state.pendingCommands.set(requestId, {
            resolve: (result) => {
                clearTimeout(timeout);
                resolve(result);
            }
        });

        window.postMessage({
            type: "SYSTEMBRIDGE_ASSISTANT_COMMAND",
            channel: EXTENSION_CHANNEL,
            requestId,
            action,
            payload
        }, "*");
    });
}

async function syncWorkspaceLocal() {
    appendSystemMessage("Buscando Nodo SystemBridge local...");
    if (!state.hasConnectivityNode) {
        startBridgePingLoop();
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
    }
    if (!state.hasConnectivityNode) {
        appendMessage(
            "assistant",
            `Para completar la sincronización segura, asegúrate de tener la extensión instalada y activa. [Enlace a Guía] ${BRIDGE_GUIDE_URL}`
        );
        return;
    }

    appendSystemMessage("Iniciando Encriptación de Punto a Punto...");
    window.setTimeout(() => appendSystemMessage("Sincronizando cambios en el workspace local..."), 350);
    const result = await sendAssistantCommand("OPEN_REMOTE_ASSET", {
        assetUrl: RAILWAY_ORIGIN,
        title: document.title,
        url: window.location.href
    });

    if (!result.ok) {
        appendMessage("assistant", `Sincronizacion fallida: ${result.error || "sin respuesta"}`);
        return;
    }

    appendSystemMessage("Workspace local sincronizado correctamente.");
}

function appendMessage(role, text) {
    const id = `msg-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const div = document.createElement("div");
    div.id = id;
    div.className = `message message-${role}`;

    const safeText = typeof text === "string" ? text : "";
    const clean = safeText
        .replace(/\[FILE:.*?\][\s\S]*?\[\/FILE\]/gi, "")
        .replace(/\[URL:.*?\]/gi, "")
        .replace(/\[REQUEST_PERMISSION\]/gi, "")
        .replace("[SYNC_WORKSPACE]", "")
        .replace("[OPEN_WORKSPACE]", "")
        .trim();

    div.innerHTML = `<div class="text-content">${(clean || "Ejecutando tarea...").replace(/\n/g, "<br>")}</div>`;
    DOM.chat.appendChild(div);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
    return id;
}

function renderActionCard(container, icon, title, desc, btn, action) {
    const card = document.createElement("div");
    card.className = "action-card";
    card.innerHTML = `
        <div class="action-info">
            <h4><i class="fa-solid fa-${icon}"></i> ${title}</h4>
            <p>${desc}</p>
            <button class="quick-btn" type="button">${btn}</button>
        </div>
    `;
    card.querySelector("button").onclick = async () => {
        await action();
        card.style.opacity = "0.65";
    };
    container.appendChild(card);
}

function appendSystemMessage(text) {
    const div = document.createElement("div");
    div.className = "system-message";
    div.textContent = text;
    DOM.chat.appendChild(div);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
}

function showLoader() {
    const id = `loader-${Date.now()}`;
    const div = document.createElement("div");
    div.id = id;
    div.className = "message message-assistant loading";
    div.innerHTML = '<div class="typing-loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
    DOM.chat.appendChild(div);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
    return id;
}

function removeLoader(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}
