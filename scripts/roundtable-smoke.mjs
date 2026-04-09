import assert from "node:assert/strict";

import { previewRoundPlan } from "../src/services/orchestrator.js";

function runCase(label, payload, expected) {
  const result = previewRoundPlan(payload);
  const actual = {
    targetSpeakerId: result.context.targetSpeakerId,
    targetReason: result.context.targetReason,
    firstSpeakerId: result.previewSteps[0]?.agentId || null,
    preview: result.previewSteps.map((step) => step.agentId),
  };

  if ("targetSpeakerId" in expected) {
    assert.equal(actual.targetSpeakerId, expected.targetSpeakerId, `${label}: targetSpeakerId inesperado`);
  }

  if ("targetReason" in expected) {
    assert.equal(actual.targetReason, expected.targetReason, `${label}: targetReason inesperado`);
  }

  if ("firstSpeakerId" in expected) {
    assert.equal(actual.firstSpeakerId, expected.firstSpeakerId, `${label}: primer hablante inesperado`);
  }

  if ("preview" in expected) {
    assert.deepEqual(actual.preview, expected.preview, `${label}: preview inesperado`);
  }

  console.log(`ok - ${label}`);
}

runCase(
  "target directo gojo",
  { text: "Gojo, como estas?", history: [], silencedAgents: [] },
  { targetSpeakerId: "gojo", targetReason: "direct_address", firstSpeakerId: "gojo", preview: ["gojo"] },
);

runCase(
  "direccion natural no vocativa",
  { text: "quiero preguntarle a Gojo como esta", history: [], silencedAgents: [] },
  { targetSpeakerId: "gojo", targetReason: "natural_address", firstSpeakerId: "gojo" },
);

runCase(
  "continuidad corta mantiene foco",
  {
    text: "bien gracias",
    history: [
      { role: "user", text: "Gojo, como estas?" },
      { role: "agent", speakerId: "gojo", text: "Bien. ¿Y tu?" },
      { role: "agent", speakerId: "sukuna", text: "Patetico." },
    ],
    silencedAgents: [],
  },
  { targetSpeakerId: "gojo", targetReason: "focus_continuation", firstSpeakerId: "gojo", preview: ["gojo"] },
);

runCase(
  "target principal con secundario nombrado",
  { text: "Megumi, explicale a Todo que se calle.", history: [], silencedAgents: [] },
  { targetSpeakerId: "megumi", firstSpeakerId: "megumi" },
);

runCase(
  "prompt grupal abierto mantiene cruce",
  { text: "que opinan?", history: [], silencedAgents: [] },
  { targetSpeakerId: null, preview: ["gojo", "sukuna", "gojo"] },
);

console.log("smoke de orquestacion completado");
