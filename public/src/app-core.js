import { io } from "https://cdn.socket.io/4.3.2/socket.io.esm.min.js";

const EXTENSION_CHANNEL = "SYSTEMBRIDGE_CONNECTIVITY_NODE";

const DOM = {
    chat: document.getElementById("chat-messages"),
    form: document.getElementById("chat-form"),
    input: document.getElementById("user-input"),
    modelSelect: document.getElementById("model-select"),
    nodeStatusCard: document.getElementById("node-status-card"),
    nodeStatusText: document.getElementById("node-status-text"),
    syncWorkspaceBtn: document.getElementById("sync-workspace-btn"),
    quickSummarize: document.getElementById("quick-summarize"),
    quickCleanTabs: document.getElementById("quick-clean-tabs")
};

const state = {
    history: [],
    isProcessing: false,
    currentModel: CONFIG.DEFAULT_MODEL,
    socket: io(),
    hasConnectivityNode: false,
    pendingCommands: new Map()
};

window.addEventListener("DOMContentLoaded", () => {
    populateModels();
    appendSystemMessage("SystemBridge listo. Define una tarea de productividad.");
    setupEvents();
    setupConnectivityNodeStatusListener();

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

    DOM.quickSummarize.addEventListener("click", async () => {
        await summarizeCurrentPage();
    });

    DOM.quickCleanTabs.addEventListener("click", async () => {
        const domain = window.prompt("Dominio a limpiar (ej. youtube.com):", "youtube.com");
        if (!domain) return;
        await closeTabsByDomain(domain.trim());
    });

    DOM.syncWorkspaceBtn.addEventListener("click", async () => {
        await syncWorkspaceLocal();
    });

    window.addEventListener("message", (event) => {
        if (event.source !== window || !event.data) return;
        const data = event.data;
        if (data.type !== "SYSTEMBRIDGE_ASSISTANT_RESULT" || data.channel !== EXTENSION_CHANNEL) return;
        const pending = state.pendingCommands.get(data.requestId);
        if (!pending) return;
        state.pendingCommands.delete(data.requestId);
        pending.resolve(data);
    });
}

function setupConnectivityNodeStatusListener() {
    window.addEventListener("systembridge-node-status", (event) => {
        const installed = Boolean(event.detail?.installed);
        state.hasConnectivityNode = installed;
        renderConnectivityStatus();

        if (!installed) {
            appendSystemMessage("Nodo de Conectividad Desactivado.");
            return;
        }

        appendSystemMessage("Asistente Activo - Sincronizado con Railway.");
    });
}

function renderConnectivityStatus() {
    DOM.nodeStatusCard.classList.toggle("connected", state.hasConnectivityNode);
    DOM.nodeStatusCard.classList.toggle("disconnected", !state.hasConnectivityNode);
    DOM.nodeStatusText.textContent = state.hasConnectivityNode
        ? "Asistente Activo - Sincronizado con Railway"
        : "Nodo de Conectividad Desactivado";
    DOM.syncWorkspaceBtn.disabled = !state.hasConnectivityNode;
}

async function handleSubmit() {
    if (state.isProcessing) return;
    const text = DOM.input.value.trim();
    if (!text) return;

    appendMessage("user", text);
    DOM.input.value = "";
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

async function summarizeCurrentPage() {
    appendSystemMessage("Solicitando lectura de la pagina actual al nodo de conectividad...");
    const result = await sendAssistantCommand("EXTRACT_PAGE_TEXT");

    if (!result.ok || !result.result?.text) {
        appendMessage("assistant", `No se pudo extraer contenido: ${result.error || "sin datos"}`);
        return;
    }

    const rawText = result.result.text;
    const clipped = rawText.slice(0, 9000);
    appendSystemMessage("Contenido recibido. Generando resumen ejecutivo...");
    await fetchAI(`Resume esta pagina en formato ejecutivo, con acciones concretas y riesgos relevantes.\n\nURL: ${result.result.url}\nTitulo: ${result.result.title}\n\nContenido:\n${clipped}`);
}

async function closeTabsByDomain(domain) {
    appendSystemMessage(`Solicitando limpieza de pestanas para ${domain}...`);
    const result = await sendAssistantCommand("CLOSE_TABS_BY_DOMAIN", { domain });

    if (!result.ok) {
        appendMessage("assistant", `No se pudo limpiar pestanas: ${result.error || "error desconocido"}`);
        return;
    }

    const closed = result.result?.closedTabs ?? 0;
    appendSystemMessage(`Limpieza completada: ${closed} pestanas cerradas para ${domain}.`);
}

async function syncWorkspaceLocal() {
    appendSystemMessage("Iniciando sincronizacion de workspace local...");
    const result = await sendAssistantCommand("SYNC_WORKSPACE", {
        title: document.title,
        url: window.location.href,
        timestamp: new Date().toISOString()
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
        .replace("[DEPLOY_CLIENTNODE]", "")
        .replace("[INIT_SYNC]", "")
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
