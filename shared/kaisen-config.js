export const APP_META = {
  name: "Kaisen",
  shortName: "Kaisen",
  title: "Kaisen | Chat grupal maldito",
  description:
    "Chat grupal multiagente con Sukuna, Gojo, Itadori, Megumi, Todo y Mahito.",
  tagline: "Seis voces. Entra cuando quieras.",
  promptPlaceholder:
    "Entra al cruce. Nombralos si quieres mover la mesa.",
};

export const STATUS_COPY = {
  active: "Listo",
  waiting: "Fila",
  thinking: "Escribe",
  silenced: "Sil.",
};

export const CHARACTER_ORDER = ["sukuna", "gojo", "itadori", "megumi", "todo", "mahito"];

export const CHARACTER_ROSTER = {
  sukuna: {
    id: "sukuna",
    name: "Sukuna",
    handle: "@sukuna",
    aliases: ["sukuna", "ryomen", "ryomen sukuna", "rey de las maldiciones"],
    title: "Rey de las Maldiciones",
    summary: "Dominante, cruel y afilado.",
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
    aliases: ["gojo", "satoru", "satoru gojo"],
    title: "El mas fuerte",
    summary: "Brillante, ironico y seguro.",
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
    aliases: ["itadori", "yuji", "yuji itadori"],
    title: "Corazon del grupo",
    summary: "Humano, noble y directo.",
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
    aliases: ["megumi", "fushiguro", "megumi fushiguro"],
    title: "Estratega sobrio",
    summary: "Preciso, serio y tactico.",
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
    aliases: ["todo", "aoi", "aoi todo"],
    title: "Caos con conviccion",
    summary: "Explosivo, frontal y teatral.",
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
    aliases: ["mahito"],
    title: "Filosofo deforme",
    summary: "Extraño, perverso y jugueton.",
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
