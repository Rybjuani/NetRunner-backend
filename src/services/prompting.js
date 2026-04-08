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

function buildPairDirective(character, replyToAgentId) {
  if (!replyToAgentId) {
    return {
      preferredAction: "No fuerces un cruce si la escena no lo pide.",
      firstLineRule: character.entryStyle || "Entra con una linea propia y firme.",
      finishMove: character.finisherStyle || "Cierra con una linea de tu personaje, no con moraleja.",
    };
  }

  const pairRule = character.relationships?.[replyToAgentId];

  return {
    preferredAction:
      pairRule?.preferredAction || "Responde de forma dirigida y deja clara tu postura frente al otro personaje.",
    firstLineRule:
      pairRule?.firstLineRule ||
      "La primera frase debe sonar a contestacion directa, no a opinion escrita en paralelo.",
    finishMove: pairRule?.finishMove || character.finisherStyle || "Si cierras, que quede una linea con filo.",
  };
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
    `Entrada natural: ${character.entryStyle}`,
    `Cuando reaccionas: ${character.reactionStyle}`,
    `Como cierras una escena: ${character.finisherStyle}`,
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

function buildImmediateReactionCue(character, lastRoundEntry, replyToAgentId) {
  if (!lastRoundEntry) {
    return "No hay golpe previo que devolver. Entra desde tu propia energia.";
  }

  const speaker = getCharacterById(lastRoundEntry.speakerId);
  const pairDirective = buildPairDirective(character, replyToAgentId || lastRoundEntry.speakerId);

  if (!speaker) {
    return `Primera frase: ${pairDirective.firstLineRule}`;
  }

  return [
    `Acabas de leer a ${speaker.name}.`,
    `Lo que debes hacer con ese mensaje: ${pairDirective.preferredAction}`,
    `Regla de primera frase: ${pairDirective.firstLineRule}`,
    `Si terminas la escena sobre ${speaker.name}: ${pairDirective.finishMove}`,
  ].join(" ");
}

export function buildAgentMessages({
  character,
  history,
  roundEntries,
  userText,
  references,
  targetSpeakerId,
  targetReason,
  responseRole,
  turnIndex,
  purpose,
  replyToAgentId,
  alreadySpoke,
  roundPlan,
}) {
  const targetSpeaker = targetSpeakerId ? getCharacterById(targetSpeakerId) : null;
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
  const pairDirective = buildPairDirective(character, replyToAgentId);
  const immediateReactionCue = buildImmediateReactionCue(character, lastRoundEntry, replyToAgentId);
  const ownershipLines =
    responseRole === "target_owner"
      ? [
          `El usuario te hablo a vos${targetReason === "focus_continuation" ? " y el foco viene del turno anterior" : ""}.`,
          "Sos el encargado de responder directamente y primero.",
          "Responde como destinatario principal con naturalidad, no como comentarista lateral.",
        ]
      : responseRole === "target_focus"
        ? [
            "Sigues siendo el foco principal de esta mini escena.",
            "Si vuelves a entrar, debe sentirse como aclaracion, correccion o remate de tu propia respuesta principal.",
          ]
        : responseRole === "secondary" && targetSpeaker
          ? [
              `El usuario no te hablo a vos. Le hablo a ${targetSpeaker.name}.`,
              `${targetSpeaker.name} es el destinatario principal y ya debe haber dado la respuesta base antes de que entres.`,
              "No robes la respuesta principal ni contestes como si la pregunta fuera para vos.",
              "Solo puedes comentar, provocar, contradecir, burlarte, respaldar o rematar despues de esa respuesta principal.",
            ]
          : ["No hay un destinatario unico: entra como parte de una conversacion grupal."];

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
    ...ownershipLines,
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
    `Movimiento preferido en este turno: ${pairDirective.preferredAction}`,
    `Disciplina de primera frase: ${pairDirective.firstLineRule}`,
    `Disciplina de remate: ${pairDirective.finishMove}`,
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
    `Activacion inmediata: ${immediateReactionCue}`,
    "",
    "Nuevo mensaje del usuario:",
    `Usuario: ${userText}`,
    "",
    "Instrucciones de salida:",
    `- ${guidanceByPurpose[purpose]}`,
    "- Habla como este personaje, no como un asistente.",
    responseRole === "target_owner"
      ? "- Responde la pregunta o comentario del usuario de frente; esa respuesta te pertenece a ti."
      : responseRole === "secondary"
        ? "- No respondas como destinatario principal. Tu trabajo es reaccionar despues, no contestar por el otro."
        : "- Entra de forma natural segun tu rol en la escena.",
    "- Si reaccionas a otro personaje, la primera frase debe tocar lo que acaba de decir o insinuar y sonar a contestacion real.",
    "- Si respondes a otro personaje, hablale a esa persona; no expliques desde fuera lo que piensas de ella.",
    "- No abras con marco general, resumen ni contextualizacion blanda.",
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
