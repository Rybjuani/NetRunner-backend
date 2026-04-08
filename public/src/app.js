import {
  APP_META,
  CHARACTERS,
  STATUS_COPY,
  getCharacterMeta,
} from "/shared/kaisen-config.js";

const STORAGE_KEYS = {
  silencedAgents: "kaisen_silenced_agents",
};

const DOM = {
  rosterGrid: document.getElementById("roster-grid"),
  conversation: document.getElementById("conversation"),
  typingZone: document.getElementById("typing-zone"),
  composer: document.getElementById("composer"),
  input: document.getElementById("composer-input"),
  sendButton: document.getElementById("send-button"),
  stopRoundButton: document.getElementById("stop-round-button"),
  topbarStatus: document.getElementById("topbar-status"),
};

const state = {
  messages: [],
  silencedAgents: new Set(loadSilencedAgents()),
  statuses: Object.fromEntries(CHARACTERS.map((character) => [character.id, "active"])),
  activeRound: null,
};

function loadSilencedAgents() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEYS.silencedAgents) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function persistSilencedAgents() {
  localStorage.setItem(STORAGE_KEYS.silencedAgents, JSON.stringify([...state.silencedAgents]));
}

function setRoundUiState(isActive) {
  DOM.stopRoundButton.hidden = !isActive;
  DOM.sendButton.textContent = isActive ? "Enviar nueva ronda" : "Hablarle a la mesa";
}

function setTopbarStatus(text, tone = "ready") {
  DOM.topbarStatus.textContent = text;
  DOM.topbarStatus.dataset.tone = tone;
}

function autosizeInput() {
  DOM.input.style.height = "0px";
  DOM.input.style.height = `${Math.min(DOM.input.scrollHeight, 220)}px`;
}

function scrollConversationToBottom(smooth = true) {
  DOM.conversation.scrollTo({
    top: DOM.conversation.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

function createAvatar(character, sizeClass) {
  const avatar = document.createElement("div");
  avatar.className = `avatar ${sizeClass}`;
  avatar.style.setProperty("--agent-soft", character.accentSoft);

  const image = document.createElement("img");
  image.src = character.avatar;
  image.alt = character.name;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    avatar.classList.add("is-fallback");
  });

  const fallback = document.createElement("span");
  fallback.textContent = character.fallbackInitials;

  avatar.append(image, fallback);
  return avatar;
}

function updateRosterStatuses() {
  for (const card of DOM.rosterGrid.querySelectorAll(".agent-card")) {
    const characterId = card.dataset.agentId;
    const status = state.silencedAgents.has(characterId) ? "silenced" : state.statuses[characterId] || "active";
    const statusNode = card.querySelector(".agent-status");
    const button = card.querySelector(".mute-button");

    statusNode.textContent = STATUS_COPY[status];
    statusNode.dataset.state = status;
    button.textContent = state.silencedAgents.has(characterId) ? "Reactivar" : "Silenciar";
    button.classList.toggle("is-silenced", state.silencedAgents.has(characterId));
  }
}

function renderRoster() {
  DOM.rosterGrid.innerHTML = "";

  for (const character of CHARACTERS) {
    const card = document.createElement("article");
    card.className = "agent-card";
    card.dataset.agentId = character.id;
    card.style.setProperty("--agent-accent", character.accent);
    card.style.setProperty("--agent-glow", character.accentGlow);

    const main = document.createElement("div");
    main.className = "agent-main";

    const title = document.createElement("h3");
    title.textContent = character.name;

    const copy = document.createElement("p");
    copy.textContent = `${character.title}. ${character.summary}`;

    const meta = document.createElement("div");
    meta.className = "agent-meta";
    meta.innerHTML = `
      <span>${character.providerLabel}</span>
      <span>${character.defaultModelLabel}</span>
      <span>${character.handle}</span>
    `;

    main.append(title, copy, meta);

    const actions = document.createElement("div");
    actions.className = "agent-actions";

    const status = document.createElement("span");
    status.className = "agent-status";

    const muteButton = document.createElement("button");
    muteButton.type = "button";
    muteButton.className = "mute-button";
    muteButton.dataset.action = "toggle-silence";

    actions.append(status, muteButton);
    card.append(createAvatar(character, "avatar--roster"), main, actions);
    DOM.rosterGrid.append(card);
  }

  updateRosterStatuses();
}

function appendMessage(message) {
  state.messages.push(message);

  const entry = document.createElement("article");
  entry.className = `message message--${message.role}`;

  if (message.role === "agent") {
    const character = getCharacterMeta(message.speakerId);
    entry.style.setProperty("--agent-accent", character.accent);
    entry.append(createAvatar(character, "avatar--message"));

    const card = document.createElement("div");
    card.className = "message-card";

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.innerHTML = `
      <span class="message-name">${character.name}</span>
      <span class="message-provider">${message.provider}</span>
    `;

    const body = document.createElement("div");
    body.className = "message-body";
    body.textContent = message.text;

    card.append(meta, body);
    entry.append(card);
  } else {
    const card = document.createElement("div");
    card.className = "message-card";

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.innerHTML = `<span class="message-name">${message.role === "user" ? "Tu" : "Mesa"}</span>`;

    const body = document.createElement("div");
    body.className = "message-body";
    body.textContent = message.text;

    card.append(meta, body);
    entry.append(card);
  }

  DOM.conversation.append(entry);
  scrollConversationToBottom();
}

function setAllStatuses(status) {
  for (const character of CHARACTERS) {
    state.statuses[character.id] = state.silencedAgents.has(character.id) ? "silenced" : status;
  }
  updateRosterStatuses();
}

function resetStatuses() {
  for (const character of CHARACTERS) {
    state.statuses[character.id] = state.silencedAgents.has(character.id) ? "silenced" : "active";
  }
  updateRosterStatuses();
}

function markRoundStatuses(selectedAgentIds, activeAgentId = null) {
  for (const character of CHARACTERS) {
    if (state.silencedAgents.has(character.id)) {
      state.statuses[character.id] = "silenced";
      continue;
    }

    if (character.id === activeAgentId) {
      state.statuses[character.id] = "thinking";
      continue;
    }

    if (selectedAgentIds.includes(character.id)) {
      state.statuses[character.id] = "waiting";
      continue;
    }

    state.statuses[character.id] = "active";
  }

  updateRosterStatuses();
}

function clearTypingIndicator() {
  DOM.typingZone.innerHTML = "";
}

function showTypingIndicator(characterId) {
  const character = getCharacterMeta(characterId);
  DOM.typingZone.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "typing-entry";
  wrapper.style.setProperty("--agent-accent", character.accent);

  const card = document.createElement("div");
  card.className = "typing-card";
  card.append(createAvatar(character, "avatar--typing"));

  const copy = document.createElement("div");
  copy.className = "typing-copy";

  const name = document.createElement("strong");
  name.textContent = character.name;

  const label = document.createElement("span");
  label.textContent = "esta escribiendo";

  const dots = document.createElement("div");
  dots.className = "typing-dots";
  dots.innerHTML = "<i></i><i></i><i></i>";

  copy.append(name, label);
  card.append(copy, dots);
  wrapper.append(card);
  DOM.typingZone.append(wrapper);
  scrollConversationToBottom();
}

function delayForRound(ms, token) {
  return new Promise((resolve, reject) => {
    if (!state.activeRound || state.activeRound.token !== token || state.activeRound.cancelled) {
      reject(new Error("ROUND_CANCELLED"));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      state.activeRound?.timers.delete(timeoutId);
      resolve();
    }, ms);

    state.activeRound.timers.add(timeoutId);
  });
}

function cancelRound(reason = "manual") {
  if (!state.activeRound) return;

  state.activeRound.cancelled = true;
  state.activeRound.controller.abort();

  for (const timeoutId of state.activeRound.timers) {
    clearTimeout(timeoutId);
  }

  clearTypingIndicator();
  state.activeRound = null;
  setRoundUiState(false);
  setTopbarStatus(reason === "manual" ? "Ronda interrumpida" : "Mesa lista", "ready");
  resetStatuses();
}

function buildHistoryPayload() {
  return state.messages
    .filter((message) => message.role === "user" || message.role === "agent")
    .slice(-18)
    .map((message) => ({
      role: message.role,
      speakerId: message.speakerId || null,
      text: message.text,
    }));
}

async function playRound(round, token) {
  const pendingQueue = [...round.selectedAgentIds];
  markRoundStatuses(pendingQueue, pendingQueue[0] || null);

  for (const step of round.steps) {
    if (!state.activeRound || state.activeRound.token !== token || state.activeRound.cancelled) {
      return;
    }

    if (state.silencedAgents.has(step.agentId)) {
      pendingQueue.splice(pendingQueue.indexOf(step.agentId), 1);
      continue;
    }

    markRoundStatuses(pendingQueue, step.agentId);
    setTopbarStatus(`${getCharacterMeta(step.agentId).name} esta pensando`, "busy");

    await delayForRound(step.timing.thinkingMs, token);
    showTypingIndicator(step.agentId);
    setTopbarStatus(`${getCharacterMeta(step.agentId).name} esta escribiendo`, "busy");

    await delayForRound(step.timing.typingMs, token);
    clearTypingIndicator();

    appendMessage({
      id: step.id,
      role: "agent",
      speakerId: step.agentId,
      text: step.text,
      provider: `${step.provider} / ${step.model}`,
    });

    pendingQueue.splice(pendingQueue.indexOf(step.agentId), 1);
    markRoundStatuses(pendingQueue, pendingQueue[0] || null);
  }
}

async function submitMessage(text) {
  if (state.activeRound) {
    cancelRound("superseded");
  }

  const message = {
    id: crypto.randomUUID(),
    role: "user",
    text,
  };

  appendMessage(message);
  setRoundUiState(true);
  setTopbarStatus("La mesa decide el orden", "busy");
  setAllStatuses("active");

  const token = crypto.randomUUID();
  const controller = new AbortController();
  state.activeRound = {
    token,
    controller,
    cancelled: false,
    timers: new Set(),
  };

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        history: buildHistoryPayload(),
        silencedAgents: [...state.silencedAgents],
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "La mesa no pudo responder.");
    }

    if (!state.activeRound || state.activeRound.token !== token || state.activeRound.cancelled) {
      return;
    }

    await playRound(payload, token);
  } catch (error) {
    if (error.name !== "AbortError" && error.message !== "ROUND_CANCELLED") {
      appendMessage({
        id: crypto.randomUUID(),
        role: "system",
        text: error.message || "La mesa perdio el hilo en esta ronda.",
      });
    }
  } finally {
    if (state.activeRound?.token === token) {
      clearTypingIndicator();
      state.activeRound = null;
      setRoundUiState(false);
      setTopbarStatus("Mesa lista", "ready");
      resetStatuses();
    }
  }
}

function handleRosterClick(event) {
  const button = event.target.closest("[data-action='toggle-silence']");
  if (!button) return;

  const card = button.closest(".agent-card");
  const characterId = card?.dataset.agentId;
  if (!characterId) return;

  if (state.silencedAgents.has(characterId)) {
    state.silencedAgents.delete(characterId);
  } else {
    state.silencedAgents.add(characterId);
  }

  persistSilencedAgents();
  updateRosterStatuses();
}

function bindEvents() {
  DOM.input.placeholder = APP_META.promptPlaceholder;
  DOM.input.addEventListener("input", autosizeInput);

  DOM.composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = DOM.input.value.trim();
    if (!text) return;

    DOM.input.value = "";
    autosizeInput();
    await submitMessage(text);
  });

  DOM.input.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();

    const text = DOM.input.value.trim();
    if (!text) return;

    DOM.input.value = "";
    autosizeInput();
    await submitMessage(text);
  });

  DOM.stopRoundButton.addEventListener("click", () => {
    cancelRound("manual");
  });

  DOM.rosterGrid.addEventListener("click", handleRosterClick);
}

function bootstrap() {
  document.title = APP_META.title;
  renderRoster();
  bindEvents();
  autosizeInput();
  resetStatuses();
  setRoundUiState(false);
  setTopbarStatus("Mesa lista", "ready");

  appendMessage({
    id: crypto.randomUUID(),
    role: "system",
    text: "Mesa activa. Puedes mencionar a @sukuna, @gojo, @itadori, @megumi, @todo o @mahito. Si no mencionas a nadie, la orquestacion elige una combinacion de voces para mantener la ronda viva sin saturarla.",
  });
}

bootstrap();
