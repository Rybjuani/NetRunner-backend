import crypto from "crypto";

import { CHARACTERS } from "../config/characters.js";
import { runtime } from "../config/runtime.js";
import { generateCharacterReply } from "../providers/index.js";
import { buildAgentMessages } from "./prompting.js";

const MENTION_ALIASES = new Map(
  CHARACTERS.flatMap((character) => [
    [character.id, character.id],
    [character.name.toLowerCase(), character.id],
    [character.handle.replace("@", "").toLowerCase(), character.id],
  ]),
);

function createRequestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function clampText(text, maxLength = 4000) {
  return String(text || "").trim().slice(0, maxLength);
}

function sanitizeHistoryEntry(entry) {
  const role = entry?.role === "agent" ? "agent" : entry?.role === "user" ? "user" : null;
  const text = clampText(entry?.text, 1200);
  if (!role || !text) return null;

  const speakerId = role === "agent" && typeof entry?.speakerId === "string" ? entry.speakerId.toLowerCase() : null;
  if (role === "agent" && !MENTION_ALIASES.has(speakerId)) return null;

  return {
    role,
    speakerId: role === "agent" ? MENTION_ALIASES.get(speakerId) : null,
    text,
  };
}

function normalizeSilencedAgents(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((item) => String(item || "").toLowerCase()).filter((item) => MENTION_ALIASES.has(item)))]
    .map((item) => MENTION_ALIASES.get(item));
}

function extractMentions(text) {
  const matches = [...String(text || "").toLowerCase().matchAll(/@([a-z0-9_-]+)/g)];
  const mentions = [];

  for (const match of matches) {
    const characterId = MENTION_ALIASES.get(match[1]);
    if (characterId && !mentions.includes(characterId)) {
      mentions.push(characterId);
    }
  }

  return mentions;
}

function countKeywordHits(text, keywords) {
  const lowered = text.toLowerCase();
  return keywords.reduce((count, keyword) => (lowered.includes(keyword) ? count + 1 : count), 0);
}

function wantsSoloReply(text) {
  return /(?:solo|solamente|unicamente|only)\s+(?:@?[a-z0-9_-]+|responda|responde)/i.test(text);
}

function requestsFullTable(text) {
  return /(?:todos|los seis|los 6|cada uno|mesa completa|equipo completo|all of you|everyone)/i.test(text);
}

function requestsDebate(text) {
  return /(?:compar|debate|discuta|discutan|versus|vs\.?|ranking|opinen|contrasten)/i.test(text);
}

function recentAgentTurns(history) {
  return history.filter((entry) => entry.role === "agent").slice(-8);
}

function determineDesiredSpeakers({ text, mentions, availableCount }) {
  if (availableCount <= 1) return 1;
  if (wantsSoloReply(text)) return 1;
  if (mentions.length >= 2) return Math.min(runtime.chat.maxParallelAgents, mentions.length);
  if (mentions.length === 1) return Math.min(runtime.chat.maxParallelAgents, 2);
  if (requestsFullTable(text) || requestsDebate(text)) return runtime.chat.maxParallelAgents;
  return Math.min(runtime.chat.maxParallelAgents, 2);
}

function scoreCharacter({ character, text, mentions, history }) {
  const lowered = text.toLowerCase();
  const agentHistory = recentAgentTurns(history);
  const lastSpeaker = agentHistory.at(-1)?.speakerId;
  const recentOccurrences = agentHistory.filter((entry) => entry.speakerId === character.id).length;
  const namedWithoutMention = lowered.includes(character.name.toLowerCase()) ? 1 : 0;
  const keywordHits = countKeywordHits(text, character.keywords);

  let score = 10;
  if (mentions.includes(character.id)) score += 120;
  score += namedWithoutMention * 25;
  score += keywordHits * 14;
  score -= recentOccurrences * 34;
  if (lastSpeaker === character.id) score -= 45;
  score += Math.max(0, character.cooldownTurns - recentOccurrences) * 8;
  score += Math.random() * 4;

  return score;
}

function pickParticipants({ text, history, mentions, silencedAgents }) {
  const silenced = new Set(silencedAgents);
  const available = CHARACTERS.filter((character) => !silenced.has(character.id));
  if (!available.length) {
    throw createRequestError("Todos los personajes estan silenciados. Activa al menos uno.", 400);
  }

  const desiredCount = Math.min(
    determineDesiredSpeakers({
      text,
      mentions,
      availableCount: available.length,
    }),
    runtime.chat.maxRoundTurns,
    available.length,
  );

  const selected = [];
  for (const mention of mentions) {
    const character = available.find((candidate) => candidate.id === mention);
    if (character && !selected.some((item) => item.id === character.id)) {
      selected.push(character);
    }
  }

  const ranked = available
    .filter((character) => !selected.some((item) => item.id === character.id))
    .map((character) => ({
      character,
      score: scoreCharacter({ character, text, mentions, history }),
    }))
    .sort((left, right) => right.score - left.score);

  for (const entry of ranked) {
    if (selected.length >= desiredCount) break;
    selected.push(entry.character);
  }

  return selected.slice(0, desiredCount);
}

function randomBetween(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

function buildTiming({ character, text, index }) {
  const range = index === 0 ? runtime.chat.initialDelayMs : runtime.chat.betweenDelayMs;
  const baseTotal = randomBetween(range.min, range.max);
  const adjustedTotal = Math.round(baseTotal * character.delayBias);
  const cappedTotal = Math.max(range.min, Math.min(adjustedTotal, range.max + 650));
  const typingBase = 900 + Math.min(text.length, 220) * (index === 0 ? 9 : 8);
  const typingMs = Math.min(Math.round(cappedTotal * 0.62), typingBase);
  const safeTypingMs = Math.max(850, typingMs);
  const thinkingMs = Math.max(700, cappedTotal - safeTypingMs);

  return {
    thinkingMs,
    typingMs: safeTypingMs,
  };
}

export function sanitizeChatRequest(body) {
  const text = clampText(body?.text, 4000);
  if (!text) {
    throw createRequestError("El mensaje no puede estar vacio.", 400);
  }

  const history = Array.isArray(body?.history)
    ? body.history.map(sanitizeHistoryEntry).filter(Boolean).slice(-runtime.chat.historyWindow)
    : [];

  return {
    text,
    history,
    silencedAgents: normalizeSilencedAgents(body?.silencedAgents),
  };
}

export async function createRoundtableConversation({ text, history, silencedAgents }) {
  const mentions = extractMentions(text);
  const selected = pickParticipants({
    text,
    history,
    mentions,
    silencedAgents,
  });
  const roundId = crypto.randomUUID();
  const roundEntries = [];
  const steps = [];

  for (const [index, character] of selected.entries()) {
    const messages = buildAgentMessages({
      character,
      history,
      roundEntries,
      userText: text,
      mentions,
      selectedIds: selected.map((item) => item.id),
      turnIndex: index,
    });

    const response = await generateCharacterReply({
      character,
      messages,
    });

    const step = {
      id: crypto.randomUUID(),
      agentId: character.id,
      text: response.text,
      provider: response.provider,
      model: response.model,
      timing: buildTiming({
        character,
        text: response.text,
        index,
      }),
      fallbackTrace: response.trace,
    };

    steps.push(step);
    roundEntries.push({
      role: "agent",
      speakerId: character.id,
      text: response.text,
    });
  }

  return {
    roundId,
    selectedAgentIds: selected.map((character) => character.id),
    mentions,
    steps,
  };
}
