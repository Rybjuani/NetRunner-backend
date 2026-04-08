import crypto from "crypto";

import { CHARACTERS, getCharacter } from "../config/characters.js";
import { runtime } from "../config/runtime.js";
import { generateCharacterReply } from "../providers/index.js";
import { buildAgentMessages } from "./prompting.js";

const SIGNAL_GROUPS = runtime.chat.signals;
const GENERIC_OPENERS = [
  "buena pregunta",
  "es una buena pregunta",
  "yo diria que",
  "diria que",
  "creo que",
  "en mi opinion",
  "personalmente",
  "la verdad es que",
  "si soy sincero",
  "honestamente",
  "sinceramente",
  "desde mi punto de vista",
];
const GENERIC_CLOSERS = [
  "en resumen",
  "en pocas palabras",
  "en definitiva",
  "eso seria todo",
  "es una buena reflexion",
  "es una buena pregunta",
];

const CHARACTER_REFERENCE_PATTERNS = CHARACTERS.map((character) => ({
  characterId: character.id,
  explicitAliases: [character.handle.replace("@", "").toLowerCase(), character.id.toLowerCase()],
  naturalAliases: [...new Set([character.name.toLowerCase(), ...(character.aliases || []).map((alias) => alias.toLowerCase())])],
}));

function createRequestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function clampText(text, maxLength = 4000) {
  return String(text || "").trim().slice(0, maxLength);
}

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesSignal(text, signals = []) {
  return signals.some((signal) => text.includes(signal));
}

function sanitizeHistoryEntry(entry) {
  const role = entry?.role === "agent" ? "agent" : entry?.role === "user" ? "user" : null;
  const text = clampText(entry?.text, 1200);
  if (!role || !text) return null;

  const speakerId = role === "agent" && typeof entry?.speakerId === "string" ? entry.speakerId.toLowerCase() : null;
  if (role === "agent" && !getCharacter(speakerId)) return null;

  return {
    role,
    speakerId: role === "agent" ? speakerId : null,
    text,
  };
}

function normalizeSilencedAgents(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((item) => String(item || "").toLowerCase()).filter((item) => Boolean(getCharacter(item))))];
}

function extractCharacterReferences(text) {
  const lowered = String(text || "").toLowerCase();
  const explicitMatches = [...lowered.matchAll(/@([a-z0-9_-]+)/g)].map((match) => ({
    alias: match[1],
    index: match.index ?? 0,
  }));
  const explicit = [];
  const natural = [];
  const mentionPositions = new Map();

  for (const referenceConfig of CHARACTER_REFERENCE_PATTERNS) {
    const explicitHit = explicitMatches.find((match) => referenceConfig.explicitAliases.includes(match.alias));
    if (explicitHit) {
      explicit.push(referenceConfig.characterId);
      mentionPositions.set(referenceConfig.characterId, explicitHit.index);
      continue;
    }

    let earliestIndex = Infinity;
    for (const alias of referenceConfig.naturalAliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias).replace(/\\ /g, "\\s+")}\\b`, "ig");
      const match = pattern.exec(text);
      if (match && typeof match.index === "number") {
        earliestIndex = Math.min(earliestIndex, match.index);
      }
    }

    if (earliestIndex !== Infinity) {
      natural.push(referenceConfig.characterId);
      mentionPositions.set(referenceConfig.characterId, earliestIndex);
    }
  }

  const all = [...new Set([...explicit, ...natural])];
  const ordered = [...all].sort((left, right) => (mentionPositions.get(left) ?? 99999) - (mentionPositions.get(right) ?? 99999));

  return {
    explicit,
    natural: natural.filter((id) => !explicit.includes(id)),
    all,
    ordered,
    mentionPositions,
  };
}

function recentAgentTurns(history) {
  return history.filter((entry) => entry.role === "agent").slice(-10);
}

function countKeywordHits(text, keywords) {
  const lowered = text.toLowerCase();
  return keywords.reduce((count, keyword) => (lowered.includes(keyword) ? count + 1 : count), 0);
}

function getRelationshipRule(characterId, targetId) {
  const character = typeof characterId === "string" ? getCharacter(characterId) : characterId;
  if (!character || !targetId) return null;
  return character.relationships?.[targetId] || null;
}

function calculatePairHeat(leftId, rightId) {
  if (!leftId || !rightId || leftId === rightId) return 0;

  const leftRule = getRelationshipRule(leftId, rightId);
  const rightRule = getRelationshipRule(rightId, leftId);

  return (
    (leftRule?.replyBias || 0) +
    (leftRule?.provokeBias || 0) +
    (leftRule?.interruptBias || 0) +
    (rightRule?.replyBias || 0) +
    (rightRule?.provokeBias || 0) +
    (rightRule?.interruptBias || 0)
  );
}

function buildRequestedPairTension(requestedIds) {
  let hottestPair = null;
  let hottestPairHeat = 0;

  for (let index = 0; index < requestedIds.length; index += 1) {
    for (let offset = index + 1; offset < requestedIds.length; offset += 1) {
      const pair = [requestedIds[index], requestedIds[offset]];
      const heat = calculatePairHeat(pair[0], pair[1]);
      if (heat > hottestPairHeat) {
        hottestPairHeat = heat;
        hottestPair = pair;
      }
    }
  }

  return {
    hottestPair,
    hottestPairHeat,
  };
}

function buildSceneContext(text, references, history, randomness = 1) {
  const lowered = text.toLowerCase();
  const wordCount = countWords(text);
  const recentAgents = recentAgentTurns(history);
  const requestedPairTension = buildRequestedPairTension(references.all);

  return {
    text,
    lowered,
    wordCount,
    references,
    requestedIds: references.all,
    explicitIds: references.explicit,
    naturalIds: references.natural,
    orderedIds: references.ordered,
    primaryId: references.ordered[0] || null,
    secondaryId: references.ordered[1] || null,
    directReferenceCount: references.all.length,
    solo: includesSignal(lowered, SIGNAL_GROUPS.solo),
    debate: includesSignal(lowered, SIGNAL_GROUPS.debate),
    groupAsked: includesSignal(lowered, SIGNAL_GROUPS.group),
    emotional: includesSignal(lowered, SIGNAL_GROUPS.emotional),
    strategic: includesSignal(lowered, SIGNAL_GROUPS.strategic),
    chaotic: includesSignal(lowered, SIGNAL_GROUPS.chaotic),
    humorous: includesSignal(lowered, SIGNAL_GROUPS.humor),
    silenceCallout: /callad|silencio|mudos|despierten|apagados/i.test(text),
    comparison: references.all.length >= 2 || /ganaria|vs\b|versus|mejor|pelea/i.test(text),
    shortPing: wordCount <= 8,
    hottestPair: requestedPairTension.hottestPair,
    hottestPairHeat: requestedPairTension.hottestPairHeat,
    elevatedCrossTalk:
      requestedPairTension.hottestPairHeat >= 70 || references.all.length >= 2 || includesSignal(lowered, SIGNAL_GROUPS.debate),
    recentAgents,
    lastHistorySpeakerId: recentAgents.at(-1)?.speakerId || null,
    randomness,
  };
}

function determineRoundPlan(context, availableCount) {
  const hardCap = Math.min(runtime.chat.maxRoundTurns, runtime.chat.naturalRound.softMaxMessages, availableCount + 1);

  let minSteps = runtime.chat.naturalRound.minMessages;
  let desiredSteps = 2;

  if (context.solo && context.directReferenceCount <= 1) {
    desiredSteps = 1;
  } else if (context.groupAsked && context.directReferenceCount === 0) {
    minSteps = 2;
    desiredSteps = context.shortPing ? 2 : 3;
  } else if (context.shortPing && context.directReferenceCount <= 1) {
    desiredSteps = 1;
  } else if (context.debate || context.groupAsked || context.directReferenceCount >= 2 || context.comparison) {
    minSteps = 2;
    desiredSteps = 3;
  }

  if (context.wordCount > 28 || context.strategic || context.chaotic) {
    desiredSteps += 1;
  }

  if (context.groupAsked && (context.debate || context.humorous)) {
    desiredSteps += 1;
  }

  if (context.silenceCallout && context.directReferenceCount === 0) {
    minSteps = Math.max(minSteps, 2);
    desiredSteps = Math.max(desiredSteps, 2);
  }

  if (context.hottestPairHeat >= 70 || (context.elevatedCrossTalk && context.wordCount > 10)) {
    desiredSteps = Math.max(desiredSteps, Math.min(hardCap, 4));
  }

  desiredSteps = Math.max(minSteps, Math.min(desiredSteps, hardCap));

  return {
    minSteps,
    desiredSteps,
    hardCap: Math.max(1, Math.min(runtime.chat.maxRoundTurns, hardCap)),
    allowReentry:
      context.debate ||
      context.directReferenceCount >= 2 ||
      context.wordCount > 22 ||
      context.comparison ||
      context.hottestPairHeat >= 60,
  };
}

function randomJitter(context, scale = 4) {
  return Math.random() * scale * context.randomness;
}

function baseContextBoost(character, context) {
  let score = 0;

  if (context.explicitIds.includes(character.id)) score += 160;
  if (context.naturalIds.includes(character.id)) score += 96;
  if (context.primaryId === character.id) score += 48;
  if (context.secondaryId === character.id) score += 18;

  score += countKeywordHits(context.text, character.keywords) * 16;

  if (context.emotional && ["itadori", "megumi", "gojo"].includes(character.id)) score += 18;
  if (context.strategic && ["megumi", "gojo", "sukuna"].includes(character.id)) score += 18;
  if (context.chaotic && ["sukuna", "mahito", "todo"].includes(character.id)) score += 18;
  if (context.humorous && ["gojo", "todo", "mahito"].includes(character.id)) score += 12;
  if (context.silenceCallout && ["gojo", "todo", "mahito", "itadori"].includes(character.id)) score += 14;
  if (context.hottestPair?.includes(character.id)) score += 18;

  return score;
}

function scoreOpeningSpeaker({ character, context, history }) {
  const recentAgents = recentAgentTurns(history);
  const recentOccurrences = recentAgents.filter((entry) => entry.speakerId === character.id).length;
  const lastSpeaker = recentAgents.at(-1)?.speakerId || null;

  let score = 14 + baseContextBoost(character, context);
  score += character.openingBias * 22;
  score -= recentOccurrences * 30;

  if (lastSpeaker === character.id) score -= 42;
  if (context.solo && context.requestedIds.includes(character.id)) score += 34;
  if (context.groupAsked && ["gojo", "itadori", "todo"].includes(character.id)) score += 10;
  if (context.comparison && context.primaryId === character.id) score += 10;

  score += randomJitter(context, 4);
  return score;
}

function extractNamedCharactersFromText(text) {
  return extractCharacterReferences(text).all;
}

function scoreRelationship(character, previousSpeakerId, lastEntry, namesInLastEntry, context) {
  if (!previousSpeakerId || previousSpeakerId === character.id) return 0;

  const directRule = getRelationshipRule(character, previousSpeakerId);
  const reverseRule = getRelationshipRule(previousSpeakerId, character.id);
  let score = 0;
  if (character.dynamics.provokes.includes(previousSpeakerId)) score += 28;
  if (character.dynamics.backsUp.includes(previousSpeakerId)) score += 16;
  if (character.dynamics.clashesWith.includes(previousSpeakerId)) score += 22;
  if (character.dynamics.baitedBy.includes(previousSpeakerId)) score += 18;
  score += directRule?.replyBias || 0;
  score += Math.round((directRule?.provokeBias || 0) * 0.75);
  score += Math.round((reverseRule?.provokeBias || 0) * 0.42);

  if (namesInLastEntry.includes(character.id)) {
    score += directRule?.namedReplyBias || reverseRule?.namedReplyBias || 26;
  }
  if (lastEntry?.replyToAgentId === character.id) {
    score += directRule?.interruptBias || reverseRule?.interruptBias || 24;
  }
  if (context.hottestPair?.includes(character.id) && context.hottestPair?.includes(previousSpeakerId)) {
    score += 20;
  }

  return score;
}

function scoreFollowUpSpeaker({ character, context, roundEntries, history, plan }) {
  const roundOccurrences = roundEntries.filter((entry) => entry.speakerId === character.id).length;
  const lastEntry = roundEntries.at(-1) || null;
  const previousSpeakerId = lastEntry?.speakerId || null;
  const firstSpeakerId = roundEntries[0]?.speakerId || null;
  const namesInLastEntry = lastEntry ? extractNamedCharactersFromText(lastEntry.text) : [];

  let score = 12 + baseContextBoost(character, context);
  score += character.followUpBias * 18;
  score += scoreRelationship(character, previousSpeakerId, lastEntry, namesInLastEntry, context);

  if (roundOccurrences === 0) score += 14;
  if (context.requestedIds.includes(character.id) && roundOccurrences === 0) score += 34;
  if (plan.allowReentry && roundOccurrences === 1 && character.id === firstSpeakerId && roundEntries.length >= 2) {
    score += character.reentryBias * 22;
    if (context.hottestPair?.includes(character.id)) {
      score += 12;
    }
  }
  if (context.comparison && context.secondaryId === character.id && roundOccurrences === 0) score += 16;
  if (context.hottestPair?.includes(character.id) && roundOccurrences === 0) score += 14;

  if (roundOccurrences >= runtime.chat.naturalRound.maxSpeakerEntriesPerRound) {
    score -= 120;
  } else {
    score -= roundOccurrences * 24;
  }

  if (previousSpeakerId === character.id) score -= 220;
  if (context.lastHistorySpeakerId === character.id) score -= 18;

  score += randomJitter(context, 4);
  return score;
}

function scoreClosingSpeaker({ character, context, roundEntries, history, plan }) {
  let score = scoreFollowUpSpeaker({ character, context, roundEntries, history, plan });
  score += character.closerBias * 22;

  const previousSpeakerId = roundEntries.at(-1)?.speakerId || null;
  const directRule = previousSpeakerId ? getRelationshipRule(character, previousSpeakerId) : null;
  if (previousSpeakerId && character.dynamics.closesBestAgainst.includes(previousSpeakerId)) score += 18;
  score += directRule?.closeBias || 0;
  if (["itadori", "megumi", "gojo"].includes(character.id)) score += 8;
  if (context.debate && ["gojo", "sukuna", "mahito"].includes(character.id)) score += 8;

  return score;
}

function chooseSpeaker({ availableCharacters, blockedIds, scorer }) {
  const ranked = availableCharacters
    .filter((character) => !blockedIds.has(character.id))
    .map((character) => ({
      character,
      score: scorer(character),
    }))
    .sort((left, right) => right.score - left.score);

  return ranked[0] || null;
}

function determinePurpose({ roundEntries, context, plan }) {
  if (roundEntries.length === 0) return "open";
  if (roundEntries.length + 1 >= plan.desiredSteps) return "close";
  if (context.debate || context.directReferenceCount >= 2 || context.comparison) return "react";
  if (context.hottestPairHeat >= 70 && roundEntries.length < plan.desiredSteps) return "react";
  if (roundEntries.length === 1 && !context.solo && (context.groupAsked || context.wordCount > 18)) return "react";
  return "close";
}

function pickNextSpeaker({ availableCharacters, blockedIds, context, history, roundEntries, plan }) {
  const purpose = determinePurpose({ roundEntries, context, plan });
  const selection = chooseSpeaker({
    availableCharacters,
    blockedIds,
    scorer: (character) => {
      if (purpose === "open") {
        return scoreOpeningSpeaker({ character, context, history });
      }

      if (purpose === "close") {
        return scoreClosingSpeaker({ character, context, roundEntries, history, plan });
      }

      return scoreFollowUpSpeaker({ character, context, roundEntries, history, plan });
    },
  });

  if (!selection) return null;

  const previousSpeakerId = roundEntries.at(-1)?.speakerId || null;
  const replyToAgentId =
    purpose === "open" || !previousSpeakerId || previousSpeakerId === selection.character.id
      ? null
      : previousSpeakerId;

  return {
    ...selection,
    purpose,
    replyToAgentId,
  };
}

function splitIntoSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function trimToWordLimit(text, maxWords) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();

  const trimmed = words.slice(0, maxWords).join(" ").trim();
  const sentenceCut = trimmed.match(/^(.+[.!?])(?:\s|$)/);
  return (sentenceCut?.[1] || trimmed).trim();
}

function stripConfiguredLeadIn(text, patterns = []) {
  let current = text.trim();

  for (const phrase of [...GENERIC_OPENERS, ...patterns]) {
    const expression = new RegExp(`^${escapeRegExp(phrase)}[,:.!\\s-]*`, "i");
    current = current.replace(expression, "").trim();
  }

  return current;
}

function isWeakClosingSentence(sentence, patterns = []) {
  const lowered = sentence.toLowerCase();
  return [...GENERIC_CLOSERS, ...patterns].some((phrase) => lowered.startsWith(phrase));
}

function tightenSentences(sentences, character) {
  let current = [...sentences];

  while (current.length > 1 && isWeakClosingSentence(current.at(-1), character.stripClosers)) {
    current.pop();
  }

  if (current.length > character.maxSentences) {
    if (character.maxSentences === 2 && current.length >= 3) {
      current = [current[0], current.at(-1)];
    } else {
      current = current.slice(0, character.maxSentences);
    }
  }

  return current;
}

function cleanAgentText(text, character) {
  let normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(new RegExp(`^${character.name}\\s*[:,-]\\s*`, "i"), "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  normalized = stripConfiguredLeadIn(normalized, character.stripLeadIns);

  let sentences = splitIntoSentences(normalized);
  sentences = tightenSentences(sentences, character);
  normalized = sentences.join(" ").trim();
  normalized = trimToWordLimit(normalized, character.maxWords);

  return normalized;
}

function buildTiming({ character, text, index, purpose }) {
  const range = index === 0 ? runtime.chat.initialDelayMs : runtime.chat.betweenDelayMs;
  const baseTotal = Math.round(range.min + Math.random() * (range.max - range.min));
  const purposeAdjustment = purpose === "react" ? -240 : purpose === "close" ? -80 : 0;
  const adjustedTotal = Math.round((baseTotal + purposeAdjustment) * character.delayBias);
  const cappedTotal = Math.max(range.min, Math.min(adjustedTotal, range.max + 260));
  const typingBase = 640 + Math.min(text.length, 160) * 7;
  const typingMs = Math.max(560, Math.min(Math.round(cappedTotal * 0.56), typingBase));
  const thinkingMs = Math.max(460, cappedTotal - typingMs);

  return {
    thinkingMs,
    typingMs,
  };
}

function shouldStopRound({ context, plan, roundEntries, nextCandidateScore, failures }) {
  if (roundEntries.length >= plan.hardCap) return true;
  if (roundEntries.length < plan.minSteps) return false;
  if (failures >= runtime.chat.naturalRound.maxProviderFailuresPerRound && roundEntries.length > 0) return true;
  if (roundEntries.length >= plan.desiredSteps) return true;

  const spokenIds = [...new Set(roundEntries.map((entry) => entry.speakerId))];
  const coveredReferences =
    context.requestedIds.length === 0 ||
    context.requestedIds.every((characterId) => spokenIds.includes(characterId));

  if (context.solo && roundEntries.length >= 1) return true;
  if (context.shortPing && context.directReferenceCount <= 1 && roundEntries.length >= 1) return true;
  if (
    !context.debate &&
    !context.comparison &&
    context.hottestPairHeat < 70 &&
    coveredReferences &&
    roundEntries.length >= 2 &&
    nextCandidateScore < 88
  ) {
    return true;
  }
  if (coveredReferences && roundEntries.length >= 3 && nextCandidateScore < (context.hottestPairHeat >= 70 ? 122 : 100)) {
    return true;
  }
  if (!coveredReferences && roundEntries.length >= plan.desiredSteps - 1 && nextCandidateScore < 112) return true;

  return false;
}

function buildPreviewEntry(characterId, replyToAgentId) {
  const character = getCharacter(characterId);
  const replyTarget = replyToAgentId ? getCharacter(replyToAgentId) : null;

  if (!character) {
    return "Mesa.";
  }

  if (replyTarget) {
    return `${character.name} corta a ${replyTarget.name}.`;
  }

  return `${character.name} entra primero.`;
}

function planRound({ text, history, silencedAgents, randomize = true }) {
  const references = extractCharacterReferences(text);
  const context = buildSceneContext(text, references, history, randomize ? 1 : 0);
  const silenced = new Set(silencedAgents);
  const availableCharacters = CHARACTERS.filter((character) => !silenced.has(character.id));

  if (!availableCharacters.length) {
    throw createRequestError("Todos los personajes estan silenciados. Activa al menos uno.", 400);
  }

  const plan = determineRoundPlan(context, availableCharacters.length);
  const roundEntries = [];
  const previewSteps = [];
  const blockedIds = new Set();

  while (previewSteps.length < plan.hardCap) {
    const candidate = pickNextSpeaker({
      availableCharacters,
      blockedIds,
      context,
      history,
      roundEntries,
      plan,
    });

    if (!candidate) break;

    previewSteps.push({
      agentId: candidate.character.id,
      purpose: candidate.purpose,
      replyToAgentId: candidate.replyToAgentId,
      score: Math.round(candidate.score),
    });

    roundEntries.push({
      role: "agent",
      speakerId: candidate.character.id,
      replyToAgentId: candidate.replyToAgentId,
      text: buildPreviewEntry(candidate.character.id, candidate.replyToAgentId),
    });

    const previewCandidate = pickNextSpeaker({
      availableCharacters,
      blockedIds,
      context,
      history,
      roundEntries,
      plan,
    });

    if (
      shouldStopRound({
        context,
        plan,
        roundEntries,
        nextCandidateScore: previewCandidate?.score || 0,
        failures: 0,
      })
    ) {
      break;
    }
  }

  return {
    references,
    context,
    plan,
    previewSteps,
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

export function previewRoundPlan(request) {
  const payload = sanitizeChatRequest(request);
  return planRound({ ...payload, randomize: false });
}

export async function createRoundtableConversation({ text, history, silencedAgents }) {
  const planned = planRound({ text, history, silencedAgents, randomize: true });
  const roundId = crypto.randomUUID();
  const steps = [];
  const roundEntries = [];
  const blockedIds = new Set();
  let failures = 0;

  for (const stepPreview of planned.previewSteps) {
    const character = getCharacter(stepPreview.agentId);
    if (!character || blockedIds.has(character.id)) {
      continue;
    }

    try {
      const messages = buildAgentMessages({
        character,
        history,
        roundEntries,
        userText: text,
        references: planned.context.requestedIds,
        turnIndex: steps.length,
        purpose: stepPreview.purpose,
        replyToAgentId: stepPreview.replyToAgentId,
        alreadySpoke: roundEntries.some((entry) => entry.speakerId === character.id),
        roundPlan: planned.plan,
      });

      const response = await generateCharacterReply({
        character,
        messages,
      });

      const cleanedText = cleanAgentText(response.text, character);
      if (!cleanedText) {
        blockedIds.add(character.id);
        failures += 1;
        continue;
      }

      steps.push({
        id: crypto.randomUUID(),
        agentId: character.id,
        text: cleanedText,
        provider: response.provider,
        model: response.model,
        purpose: stepPreview.purpose,
        replyToAgentId: stepPreview.replyToAgentId,
        timing: buildTiming({
          character,
          text: cleanedText,
          index: steps.length,
          purpose: stepPreview.purpose,
        }),
        fallbackTrace: response.trace,
      });

      roundEntries.push({
        role: "agent",
        speakerId: character.id,
        replyToAgentId: stepPreview.replyToAgentId,
        text: cleanedText,
      });
    } catch (error) {
      blockedIds.add(character.id);
      failures += 1;

      if (failures >= runtime.chat.naturalRound.maxProviderFailuresPerRound && steps.length > 0) {
        break;
      }

      if (steps.length === 0 && blockedIds.size >= planned.previewSteps.length) {
        throw error;
      }
    }
  }

  if (!steps.length) {
    const error = new Error("La mesa se quedo en silencio por un momento.");
    error.statusCode = 503;
    throw error;
  }

  return {
    roundId,
    selectedAgentIds: [...new Set(steps.map((step) => step.agentId))],
    queueAgentIds: steps.map((step) => step.agentId),
    references: planned.references,
    steps,
  };
}
