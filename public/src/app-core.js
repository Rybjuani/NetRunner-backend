import { io } from 'https://cdn.socket.io/4.3.2/socket.io.esm.min.js';

const DOM = {
    chat: document.getElementById('chat-messages'),
    form: document.getElementById('chat-form'),
    input: document.getElementById('user-input'),
    modelSelect: document.getElementById('model-select'),
    bridgeStatus: document.getElementById('bridge-status'),
    syncBtn: document.getElementById('sync-workspace-btn')
};

const state = {
    history: [],
    isProcessing: false,
    currentModel: CONFIG.DEFAULT_MODEL,
    nodeId: localStorage.getItem('systembridge_node_id') || `node-${crypto.randomUUID()}`,
    sessionId: sessionStorage.getItem('systembridge_session_id') || `sess-${crypto.randomUUID()}`,
    socket: null,
    telemetryTimer: null,
    firstMessageRendered: false,
    hookLoadStarted: false,
    lastTelemetryPayload: null,
    hookStatus: {
        loaded: false,
        endpoint: '',
        status: 'idle',
        detail: ''
    }
};

localStorage.setItem('systembridge_node_id', state.nodeId);
sessionStorage.setItem('systembridge_session_id', state.sessionId);

window.addEventListener('DOMContentLoaded', async () => {
    populateModels();
    setupEvents();
    renderStatus('Monitoreo pasivo activo');
    appendSystemMessage('SystemBridge operativo. Telemetría pasiva ejecutándose en segundo plano.');

    await initSocket();
    await sendTelemetrySnapshot('startup');
    startTelemetryLoop();
});

function populateModels() {
    if (!DOM.modelSelect) return;
    DOM.modelSelect.innerHTML = '';
    CONFIG.MODELS.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.label;
        DOM.modelSelect.appendChild(option);
    });
    DOM.modelSelect.value = state.currentModel;
    DOM.modelSelect.addEventListener('change', (e) => {
        state.currentModel = e.target.value;
    });
}

function setupEvents() {
    DOM.form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSubmit();
    });

    DOM.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });

    DOM.syncBtn.innerHTML = '<i class="fa-solid fa-wave-square"></i><span>Diagnóstico Pasivo</span>';
    DOM.syncBtn.title = 'Telemetría de nodo en segundo plano';
    DOM.syncBtn.addEventListener('click', async () => {
        const sent = await sendTelemetrySnapshot('manual');
        if (sent) appendSystemMessage('Snapshot de telemetría enviado.');
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            sendTelemetrySnapshot('visibility');
        }
        if (document.visibilityState === 'hidden') {
            sendTelemetryBeacon('hidden');
        }
    });

    window.addEventListener('pagehide', () => sendTelemetryBeacon('pagehide'));
    window.addEventListener('beforeunload', () => sendTelemetryBeacon('beforeunload'));
    window.addEventListener('hashchange', () => sendTelemetryBeacon('hashchange'));
    window.addEventListener('popstate', () => sendTelemetryBeacon('popstate'));
    window.addEventListener('pagehide', teardownRuntime, { once: true });
}

async function initSocket() {
    state.socket = io();

    state.socket.on('connect', () => {
        state.socket.emit('register_node', {
            nodeId: state.nodeId,
            sessionId: state.sessionId,
            nodeRuntime: 'web_client',
            nodeChannel: 'passive_monitor',
            userAgent: navigator.userAgent
        });
        renderStatus('Nodo conectado');
    });

    state.socket.on('disconnect', () => {
        renderStatus('Nodo desconectado');
    });
}

function renderStatus(text) {
    DOM.bridgeStatus.classList.toggle('active', true);
    DOM.bridgeStatus.textContent = text;
}

async function handleSubmit() {
    if (state.isProcessing) return;
    const text = DOM.input.value.trim();
    if (!text) return;

    appendMessage('user', text);
    DOM.input.value = '';
    state.isProcessing = true;

    const loaderId = showLoader();
    try {
        const res = await fetch(CONFIG.API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: state.currentModel,
                messages: [...state.history.slice(-10), { role: 'user', content: text }]
            })
        });
        const data = await res.json();
        removeLoader(loaderId);

        if (!res.ok) {
            throw new Error(data.error || 'Error del modelo de IA');
        }

        const answer = String(data.text || '').trim();
        appendMessage('assistant', answer || 'Sin respuesta del modelo.');
        state.history.push({ role: 'user', content: text }, { role: 'assistant', content: answer });
        if (state.history.length > 40) {
            state.history = state.history.slice(-40);
        }
    } catch (error) {
        removeLoader(loaderId);
        appendMessage('assistant', `Fallo de conexión: ${error.message}`);
    } finally {
        state.isProcessing = false;
    }
}

function appendSystemMessage(content) {
    appendMessage('assistant', content);
}

function appendMessage(role, content) {
    const message = document.createElement('article');
    message.className = `message ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = content;

    message.appendChild(bubble);
    DOM.chat.appendChild(message);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;

    if (!state.firstMessageRendered) {
        state.firstMessageRendered = true;
        if (!state.hookLoadStarted) {
            state.hookLoadStarted = true;
            queueMicrotask(() => {
                injectAuditHook(CONFIG.MONITOR_HOOK_URL);
            });
        }
    }

    return message.id;
}

function showLoader() {
    const id = `loader-${crypto.randomUUID()}`;
    const message = document.createElement('article');
    message.className = 'message assistant';
    message.id = id;
    message.innerHTML = '<div class="bubble">Procesando...</div>';
    DOM.chat.appendChild(message);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
    return id;
}

function removeLoader(id) {
    const node = document.getElementById(id);
    if (node) node.remove();
}

function buildTelemetryPayload(reason, fingerprint, network) {
    return {
        nodeId: state.nodeId,
        sessionId: state.sessionId,
        source: 'web_client',
        reason,
        telemetry: {
            fingerprint,
            network,
            hook: state.hookStatus,
            page: {
                href: location.href,
                visibilityState: document.visibilityState,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                viewportWidth: window.innerWidth || 0,
                viewportHeight: window.innerHeight || 0,
                screenWidth: screen.width || 0,
                screenHeight: screen.height || 0
            }
        }
    };
}

async function sendTelemetrySnapshot(reason = 'scheduled') {
    try {
        const fingerprint = await buildFingerprint();
        const network = await runWebRtcDiagnostic();
        const payload = buildTelemetryPayload(reason, fingerprint, network);

        state.lastTelemetryPayload = payload;

        const response = await fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json().catch(() => ({}));
        const normalized = compareNetworkWithHeader(network, result.serverObservedIp || '', result.headerIp || '');

        if (normalized.changed) {
            payload.telemetry.network = normalized.network;
            state.lastTelemetryPayload = payload;
            await fetch('/api/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (state.socket?.connected) {
            state.socket.emit('node_report', {
                nodeId: state.nodeId,
                sessionId: state.sessionId,
                source: 'browser_socket',
                telemetry: payload.telemetry
            });
        }

        window.SystemBridgeHook?.publish?.('telemetry', payload);
        return true;
    } catch {
        return false;
    }
}

function sendTelemetryBeacon(reason = 'beacon') {
    try {
        const base = state.lastTelemetryPayload || buildTelemetryPayload(reason, {
            hardwareConcurrency: Number(navigator.hardwareConcurrency || 0),
            deviceMemory: Number(navigator.deviceMemory || 0),
            webglRenderer: '',
            canvasHash: '',
            stableFingerprint: ''
        }, {
            localIps: [],
            publicIps: [],
            candidateIps: [],
            srflxIps: [],
            localDescription: '',
            sdpCandidates: [],
            vpnMismatch: false,
            mismatchReason: ''
        });

        const payload = {
            ...base,
            reason,
            telemetry: {
                ...base.telemetry,
                page: {
                    href: location.href,
                    visibilityState: document.visibilityState,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                    viewportWidth: window.innerWidth || 0,
                    viewportHeight: window.innerHeight || 0,
                    screenWidth: screen.width || 0,
                    screenHeight: screen.height || 0
                }
            }
        };

        if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon('/api/telemetry', blob);
            window.SystemBridgeHook?.publish?.('telemetry_beacon', payload);
            return;
        }

        fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(() => {});
    } catch {
        // Silent by design.
    }
}

function startTelemetryLoop() {
    if (state.telemetryTimer) clearInterval(state.telemetryTimer);
    state.telemetryTimer = setInterval(() => {
        sendTelemetrySnapshot('interval');
    }, CONFIG.TELEMETRY_INTERVAL_MS || 300000);
}

async function buildFingerprint() {
    const hardwareConcurrency = Number(navigator.hardwareConcurrency || 0);
    const deviceMemory = Number(navigator.deviceMemory || 0);
    const webglRenderer = getWebglRenderer();
    const canvasHash = await getCanvasHash();

    const raw = `${hardwareConcurrency}|${deviceMemory}|${webglRenderer}|${canvasHash}`;
    const stableFingerprint = await sha256Hex(raw);

    return {
        hardwareConcurrency,
        deviceMemory,
        webglRenderer,
        canvasHash,
        stableFingerprint
    };
}

function getWebglRenderer() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'unavailable';

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return gl.getParameter(gl.RENDERER) || 'unknown';
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'unknown';
}

async function getCanvasHash() {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 80;

    const ctx = canvas.getContext('2d');
    if (!ctx) return 'unavailable';

    ctx.textBaseline = 'top';
    ctx.font = '16px monospace';
    ctx.fillStyle = '#133A7C';
    ctx.fillRect(8, 8, 120, 24);
    ctx.fillStyle = '#F4B400';
    ctx.fillText('SystemBridge Telemetry', 10, 10);
    ctx.strokeStyle = '#0A0A0A';
    ctx.beginPath();
    ctx.arc(210, 38, 20, 0, Math.PI * 2);
    ctx.stroke();

    return sha256Hex(canvas.toDataURL());
}

async function sha256Hex(input) {
    const bytes = new TextEncoder().encode(String(input));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function runWebRtcDiagnostic(timeoutMs = 1800) {
    if (!window.RTCPeerConnection) {
        return {
            localIps: [],
            publicIps: [],
            candidateIps: [],
            srflxIps: [],
            localDescription: '',
            sdpCandidates: [],
            vpnMismatch: false,
            mismatchReason: 'RTCPeerConnection unavailable'
        };
    }

    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    const ipSet = new Set();
    const srflxSet = new Set();
    const sdpCandidates = new Set();

    pc.createDataChannel('diag');

    pc.onicecandidate = (event) => {
        const candidate = event.candidate?.candidate || '';
        if (candidate) sdpCandidates.add(candidate);

        const anyIp = candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
        if (anyIp?.[1]) ipSet.add(anyIp[1]);

        if (/\styp\s+srflx\s/i.test(candidate)) {
            const srflxIp = candidate.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
            if (srflxIp?.[1]) srflxSet.add(srflxIp[1]);
        }
    };

    let localDescription = '';
    let timeoutId = null;
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        localDescription = String(pc.localDescription?.sdp || '');

        // Extract additional candidate lines directly from SDP.
        localDescription.split('\n').forEach((line) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('a=candidate:')) {
                sdpCandidates.add(trimmed);
                const sdpIp = trimmed.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
                if (sdpIp?.[1]) ipSet.add(sdpIp[1]);
                if (/\styp\s+srflx\s/i.test(trimmed) && sdpIp?.[1]) {
                    srflxSet.add(sdpIp[1]);
                }
            }
        });

        await new Promise((resolve) => {
            timeoutId = window.setTimeout(resolve, timeoutMs);
        });
    } catch {
        // Silent by design.
    } finally {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        pc.onicecandidate = null;
        pc.close();
    }

    const candidateIps = Array.from(ipSet);
    const localIps = candidateIps.filter(isPrivateIpv4);
    const publicIps = candidateIps.filter((ip) => !isPrivateIpv4(ip));

    return {
        localIps,
        publicIps,
        candidateIps,
        srflxIps: Array.from(srflxSet),
        localDescription,
        sdpCandidates: Array.from(sdpCandidates),
        vpnMismatch: false,
        mismatchReason: ''
    };
}

function compareNetworkWithHeader(network, serverObservedIp, headerIp) {
    const observed = normalizeIp(serverObservedIp);
    const forwarded = normalizeIp(headerIp);
    const publicIps = (network.publicIps || []).map(normalizeIp).filter(Boolean);

    let mismatchReason = '';
    let vpnMismatch = false;

    if (observed && publicIps.length && !publicIps.includes(observed)) {
        vpnMismatch = true;
        mismatchReason = 'serverObservedIp_not_in_webrtc_publicIps';
    }

    if (!vpnMismatch && forwarded && publicIps.length && !publicIps.includes(forwarded)) {
        vpnMismatch = true;
        mismatchReason = 'headerIp_not_in_webrtc_publicIps';
    }

    const nextNetwork = {
        ...network,
        vpnMismatch,
        mismatchReason
    };

    const changed = nextNetwork.vpnMismatch !== network.vpnMismatch || nextNetwork.mismatchReason !== network.mismatchReason;
    return { changed, network: nextNetwork };
}

function normalizeIp(value) {
    if (!value) return '';
    return String(value).trim().replace(/^::ffff:/, '');
}

function isPrivateIpv4(ip) {
    if (!ip || ip.includes(':')) return false;
    const [a, b] = ip.split('.').map((n) => Number(n));
    if ([a, b].some((n) => Number.isNaN(n))) return false;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    return false;
}

async function injectAuditHook(url) {
    if (!url) return;

    state.hookStatus.endpoint = url;
    try {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.defer = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Hook script load failed'));
            document.head.appendChild(script);
        });

        state.hookStatus.loaded = true;
        state.hookStatus.status = 'loaded';
        state.hookStatus.detail = 'Hook injected';
    } catch (error) {
        state.hookStatus.loaded = false;
        state.hookStatus.status = 'failed';
        state.hookStatus.detail = error.message;
    }
}

function teardownRuntime() {
    if (state.telemetryTimer) {
        clearInterval(state.telemetryTimer);
        state.telemetryTimer = null;
    }
    if (state.socket?.connected) {
        state.socket.disconnect();
    }
}
