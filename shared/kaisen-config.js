export const APP_META = {
  name: "Kaisen",
  shortName: "Kaisen",
  title: "Kaisen | Mesa redonda multiagente",
  description:
    "Chat grupal multiagente con Sukuna, Gojo, Itadori, Megumi, Todo y Mahito.",
  tagline: "Una mesa redonda viva, oscura y controlada.",
  promptPlaceholder:
    "Escribe para la mesa. Ej: @gojo y @megumi comparen dos planes para enfrentar este problema.",
};

export const STATUS_COPY = {
  active: "Activo",
  waiting: "Esperando",
  thinking: "Pensando",
  silenced: "Silenciado",
};

export const CHARACTER_ORDER = [
  "sukuna",
  "gojo",
  "itadori",
  "megumi",
  "todo",
  "mahito",
];

export const CHARACTER_ROSTER = {
  sukuna: {
    id: "sukuna",
    name: "Sukuna",
    handle: "@sukuna",
    title: "Rey de las Maldiciones",
    summary: "Soberbio, brutal y afilado.",
    accent: "#b12645",
    accentSoft: "rgba(177, 38, 69, 0.16)",
    accentGlow: "rgba(177, 38, 69, 0.32)",
    avatar: "/avatars/sukuna.png",
    fallbackInitials: "SU",
    providerLabel: "Zen",
    defaultModelLabel: "qwen3.6-plus-free",
  },
  gojo: {
    id: "gojo",
    name: "Gojo",
    handle: "@gojo",
    title: "El mas fuerte",
    summary: "Brillante, ludico y descarado.",
    accent: "#52c7ff",
    accentSoft: "rgba(82, 199, 255, 0.16)",
    accentGlow: "rgba(82, 199, 255, 0.32)",
    avatar: "/avatars/gojo.png",
    fallbackInitials: "GO",
    providerLabel: "Groq",
    defaultModelLabel: "llama-3.3-70b-versatile",
  },
  itadori: {
    id: "itadori",
    name: "Itadori",
    handle: "@itadori",
    title: "Corazon del equipo",
    summary: "Empatico, directo y humano.",
    accent: "#f47a3f",
    accentSoft: "rgba(244, 122, 63, 0.16)",
    accentGlow: "rgba(244, 122, 63, 0.32)",
    avatar: "/avatars/itadori.png",
    fallbackInitials: "IT",
    providerLabel: "Groq",
    defaultModelLabel: "openai/gpt-oss-20b",
  },
  megumi: {
    id: "megumi",
    name: "Megumi",
    handle: "@megumi",
    title: "Estratega sobrio",
    summary: "Frio, racional y preciso.",
    accent: "#6d8eff",
    accentSoft: "rgba(109, 142, 255, 0.16)",
    accentGlow: "rgba(109, 142, 255, 0.3)",
    avatar: "/avatars/megumi.png",
    fallbackInitials: "ME",
    providerLabel: "Ollama",
    defaultModelLabel: "gpt-oss:20b",
  },
  todo: {
    id: "todo",
    name: "Todo",
    handle: "@todo",
    title: "Caos con conviccion",
    summary: "Intenso, frontal y teatral.",
    accent: "#c9b04f",
    accentSoft: "rgba(201, 176, 79, 0.16)",
    accentGlow: "rgba(201, 176, 79, 0.3)",
    avatar: "/avatars/todo.png",
    fallbackInitials: "TO",
    providerLabel: "Groq",
    defaultModelLabel: "llama-3.1-8b-instant",
  },
  mahito: {
    id: "mahito",
    name: "Mahito",
    handle: "@mahito",
    title: "Filosofo deforme",
    summary: "Inquietante, jugueton y manipulador.",
    accent: "#84d0d6",
    accentSoft: "rgba(132, 208, 214, 0.16)",
    accentGlow: "rgba(132, 208, 214, 0.28)",
    avatar: "/avatars/mahito.png",
    fallbackInitials: "MA",
    providerLabel: "Ollama",
    defaultModelLabel: "gpt-oss:20b",
  },
};

export const CHARACTERS = CHARACTER_ORDER.map((id) => CHARACTER_ROSTER[id]);

export function getCharacterMeta(characterId) {
  return CHARACTER_ROSTER[characterId] || null;
}
