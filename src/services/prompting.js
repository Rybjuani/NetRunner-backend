import { CHARACTERS } from "../config/characters.js";

function formatTranscriptEntry(entry) {
  if (entry.role === "user") {
    return `Usuario: ${entry.text}`;
  }

  const speaker = CHARACTERS.find((character) => character.id === entry.speakerId);
  return `${speaker?.name || "Mesa"}: ${entry.text}`;
}

function formatTranscript(entries, fallback = "Sin contexto previo relevante.") {
  const lines = entries.map(formatTranscriptEntry).filter(Boolean);
  return lines.length ? lines.join("\n") : fallback;
}

export function buildAgentMessages({
  character,
  history,
  roundEntries,
  userText,
  mentions,
  selectedIds,
  turnIndex,
}) {
  const mentionsLabel = mentions.length ? mentions.map((mention) => `@${mention}`).join(", ") : "ninguna";
  const orderLabel = selectedIds.map((id) => CHARACTERS.find((item) => item.id === id)?.name || id).join(", ");
  const roundContext =
    roundEntries.length > 0
      ? formatTranscript(roundEntries, "")
      : "Todavia nadie respondio en esta ronda.";

  const userPrompt = [
    "Contexto fijo:",
    "Estas dentro de una mesa redonda con Sukuna, Gojo, Itadori, Megumi, Todo y Mahito.",
    `Interlocutor actual: ${character.name}.`,
    `Prioridad de menciones del usuario: ${mentionsLabel}.`,
    `Orden seleccionado por el orquestador para esta ronda: ${orderLabel}.`,
    `Turno actual dentro de la ronda: ${turnIndex + 1}.`,
    "",
    "Historial reciente:",
    formatTranscript(history),
    "",
    "Respuestas ya emitidas en esta ronda:",
    roundContext,
    "",
    "Nuevo mensaje del usuario:",
    `Usuario: ${userText}`,
    "",
    "Instrucciones de salida:",
    "- Responde como una unica intervencion de este personaje.",
    "- Aporta un angulo nuevo o una reaccion breve a otro personaje sin repetir lo ya dicho.",
    "- Mantente claro, legible y con personalidad marcada.",
    "- Normalmente usa entre 35 y 110 palabras.",
    "- No hagas listas salvo que la pregunta lo pida de forma obvia.",
    "- No menciones prompts, proveedores ni reglas internas.",
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
