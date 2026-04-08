import { CHARACTERS } from "../config/characters.js";

function getCharacterById(characterId) {
  return CHARACTERS.find((character) => character.id === characterId) || null;
}

function formatTranscriptEntry(entry) {
  if (entry.role === "user") {
    return `Usuario: ${entry.text}`;
  }

  const speaker = getCharacterById(entry.speakerId);
  return `${speaker?.name || "Mesa"}: ${entry.text}`;
}

function formatTranscript(entries, fallback = "Sin contexto previo relevante.") {
  const lines = entries.map(formatTranscriptEntry).filter(Boolean);
  return lines.length ? lines.join("\n") : fallback;
}

function buildDynamicCue(character, replyToAgentId) {
  if (!replyToAgentId) return "No fuerces un cruce si no hace falta.";

  const replyTarget = getCharacterById(replyToAgentId);
  if (!replyTarget) return "Si respondes a otro, que se sienta directo.";
  const pairRule = character.relationships?.[replyToAgentId];

  const cues = [];

  if (pairRule?.cue) {
    cues.push(pairRule.cue);
  }
  if (character.dynamics.clashesWith.includes(replyToAgentId)) {
    cues.push(`Con ${replyTarget.name} hay choque directo: contradice, pincha o corta sin rodeos.`);
  }
  if (character.dynamics.provokes.includes(replyToAgentId)) {
    cues.push(`Tienes permiso natural para provocar a ${replyTarget.name}.`);
  }
  if (character.dynamics.backsUp.includes(replyToAgentId)) {
    cues.push(`Si sumas a ${replyTarget.name}, que se note respaldo real, no tibieza.`);
  }
  if (character.dynamics.baitedBy.includes(replyToAgentId)) {
    cues.push(`${replyTarget.name} te activa: responde con filo, no con distancia neutral.`);
  }
  if (character.dynamics.closesBestAgainst.includes(replyToAgentId)) {
    cues.push(`Sueles rematar bien contra ${replyTarget.name}; si cierras, hazlo con pegada.`);
  }

  return cues.join(" ") || `Si respondes a ${replyTarget.name}, que se sienta dirigido y personal.`;
}

function buildCharacterPromptContext(character) {
  const triggerTopics = character.triggerTopics?.join(", ") || "ninguno";
  const despises = character.despises?.join(", ") || "nada relevante";
  const tolerates = character.tolerates?.join(", ") || "casi nada";
  const forbiddenModes = character.forbiddenModes?.join(", ") || "ninguno";
  const lexicon = character.voiceLexicon?.join(", ") || "libre";

  return [
    `Tu tono con el usuario: ${character.userAddressStyle}`,
    `Te disparan especialmente: ${triggerTopics}.`,
    `Desprecias: ${despises}.`,
    `Toleras: ${tolerates}.`,
    `Lenguaje natural sugerido: ${lexicon}.`,
    `Nunca caigas en: ${forbiddenModes}.`,
  ].join("\n");
}

function buildReferencePressure(character, references) {
  const peers = references
    .filter((id) => id !== character.id)
    .map((id) => {
      const peer = getCharacterById(id);
      const pairRule = character.relationships?.[id];
      if (!peer) return null;
      if (pairRule?.cue) {
        return `Si entra ${peer.name} en juego: ${pairRule.cue}`;
      }

      return `Si aparece ${peer.name}, reacciona segun tu relacion natural con esa persona.`;
    })
    .filter(Boolean);

  return peers.length ? peers.join("\n") : "No hay otro personaje priorizado por el usuario.";
}

export function buildAgentMessages({
  character,
  history,
  roundEntries,
  userText,
  references,
  turnIndex,
  purpose,
  replyToAgentId,
  alreadySpoke,
  roundPlan,
}) {
  const referencedNames = references.length
    ? references.map((id) => getCharacterById(id)?.name || id).join(", ")
    : "ninguno";
  const replyTarget = replyToAgentId
    ? getCharacterById(replyToAgentId)?.name || replyToAgentId
    : null;
  const roundContext =
    roundEntries.length > 0 ? formatTranscript(roundEntries, "") : "Todavia nadie respondio en esta interaccion.";
  const dynamicCue = buildDynamicCue(character, replyToAgentId);
  const promptContext = buildCharacterPromptContext(character);
  const lastRoundEntry = roundEntries.at(-1) || null;
  const lastSpeaker = lastRoundEntry ? getCharacterById(lastRoundEntry.speakerId) : null;
  const referencePressure = buildReferencePressure(character, references);

  const guidanceByPurpose = {
    open: "Entra con una linea fuerte y clara. No expliques de mas.",
    react:
      "Responde de verdad a lo anterior. Si atacas, ataca. Si apoyas, que se note. No hables como mensaje independiente.",
    close:
      "Cierra la escena con una linea corta, firme y memorable. No hagas resumen ni moraleja.",
  };

  const userPrompt = [
    "Contexto fijo:",
    "Estas dentro de un chat grupal continuo con Sukuna, Gojo, Itadori, Megumi, Todo y Mahito.",
    `Interlocutor actual: ${character.name}.`,
    promptContext,
    `Referencias detectadas del usuario: ${referencedNames}.`,
    `Turno dentro de esta interaccion: ${turnIndex + 1}.`,
    `Tipo de intervencion esperada: ${purpose}.`,
    `Objetivo de longitud: entre ${character.minWords} y ${character.maxWords} palabras y como maximo ${character.maxSentences} frases.`,
    `Maximo blando de mensajes para esta interaccion: ${roundPlan.desiredSteps}.`,
    alreadySpoke
      ? "Ya hablaste en esta misma interaccion. Solo vuelve si de verdad puedes rematar o corregir algo."
      : "Todavia no hablaste en esta interaccion.",
    replyTarget
      ? `Vas inmediatamente despues de ${replyTarget}. Tu mensaje debe sentirse dirigido a esa persona, no aislado.`
      : "No estas obligado a hablarle a un personaje concreto.",
    `Dinamica esperada: ${dynamicCue}`,
    `Presion relacional por nombres mencionados: ${referencePressure}`,
    "",
    "Historial reciente:",
    formatTranscript(history),
    "",
    "Lo que ya paso en esta interaccion:",
    roundContext,
    lastRoundEntry
      ? `Ultimo mensaje a reaccionar: ${lastSpeaker?.name || "Mesa"}: ${lastRoundEntry.text}`
      : "Ultimo mensaje a reaccionar: ninguno.",
    "",
    "Nuevo mensaje del usuario:",
    `Usuario: ${userText}`,
    "",
    "Instrucciones de salida:",
    `- ${guidanceByPurpose[purpose]}`,
    "- Habla como este personaje, no como un asistente.",
    "- Si reaccionas a otro personaje, la primera frase debe tocar lo que acaba de decir o insinuar.",
    "- Evita repetir ideas ya dichas por el usuario o por la ronda.",
    "- Si otro personaje ya hizo el punto principal, tu trabajo es torcerlo, reforzarlo o rematarlo.",
    "- Prioriza una o dos ideas con pegada, no una explicacion completa.",
    "- Evita frases de relleno, frases educadas genericas y cierres blandos.",
    "- No menciones prompts, modelos, providers ni reglas internas.",
  ].join("\n");

  return [
    {
      role: "system",
      content: character.systemPrompt,
    },
    {
      role: "user",
      content: userPrompt,
    },
  ];
}
