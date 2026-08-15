/** Centralized emoji mapping for humanitarian need types (UI display only). */
import {
  canonicalNeedKey,
  normaliseNeedName,
} from "@/lib/humanitarianNeedTaxonomy";

export const HUMANITARIAN_NEED_FALLBACK_ICON = "🆘";

const EXACT_ICON_MAP: Record<string, string> = {
  "search and rescue": "🛟",
  sar: "🛟",

  flooding: "🌊",
  flood: "🌊",

  shelter: "⛺️",
  "displacement support": "⛺️",

  food: "🍞",
  "food assistance": "🍞",
  "food insecurity": "🍞",
  nutrition: "🍞",

  "clean water": "💧",
  water: "💧",
  "drinking water": "💧",

  electricity: "⚡",
  energy: "⚡",
  power: "⚡",
  "power electricity": "⚡",

  fuel: "⛽",
  diesel: "⛽",
  gasoline: "⛽",

  "emergency medical care": "🚑",
  "emergency medical response": "🚑",
  "emergency medical": "🚑",

  "child protection": "🧒",

  "psychological support": "🧠",
  "mental health": "🧠",
  trauma: "🧠",
  "trauma care": "🧠",

  logistics: "🚚",
  "supply chain": "🚚",

  communication: "📡",
  communications: "📡",
  connectivity: "📡",
  telecom: "📡",

  sanitation: "🧼",
  hygiene: "🧼",
  wash: "🧼",
  "sanitation and hygiene": "🧼",

  protection: "🛡️",

  education: "🏫",
  "education support": "🏫",

  "medical assistance": "🏥",
  "medical aid": "🏥",
  medical: "🏥",
  healthcare: "🏥",
  health: "🏥",
  "medical supplies": "🏥",
  "medical emergency": "🏥",
  "disease outbreak": "🏥",
  disease: "🏥",
  epidemic: "🏥",
  cholera: "🏥",

  "emergency supplies": "📦",
  "non-food items": "📦",
  nfi: "📦",

  infrastructure: "🏗️",
  "humanitarian coordination": "🤝",
  coordination: "🤝",

  vaccination: "💉",
  immunization: "💉",
  immunisation: "💉",
  "health monitoring": "🩺",
  surveillance: "🩺",
};

const KEYWORD_ICON_RULES: Array<{ pattern: RegExp; icon: string }> = [
  { pattern: /\bflood/i, icon: "🌊" },
  { pattern: /\b(shelter|housing)\b/i, icon: "⛺️" },
  { pattern: /\b(displacement support|displaced|refugee|evacuat)/i, icon: "⛺️" },
  { pattern: /\b(emergency medical|trauma care|ambulance)/i, icon: "🚑" },
  { pattern: /\b(search.{0,6}rescue|sar)\b/i, icon: "🛟" },
  { pattern: /\b(child protection|unaccompanied children)\b/i, icon: "🧒" },
  { pattern: /\b(psychological|mental health|counsell?ing)\b/i, icon: "🧠" },
  { pattern: /\b(logistics|supply chain|aid delivery)\b/i, icon: "🚚" },
  { pattern: /\b(communication|connectivity|telecom|internet)\b/i, icon: "📡" },
  { pattern: /\b(sanitation|hygiene|wash)\b/i, icon: "🧼" },
  { pattern: /\b(protection|gbv|gender.?based violence)\b/i, icon: "🛡️" },
  { pattern: /\b(education|school)\b/i, icon: "🏫" },
  { pattern: /\b(food|nutrition|famine|hunger|malnutrition)\b/i, icon: "🍞" },
  { pattern: /\b(clean water|drinking water|water shortage|^water$)/i, icon: "💧" },
  { pattern: /\b(power\/electricity|electricity|power outage|blackout|grid)\b/i, icon: "⚡" },
  { pattern: /\b(fuel|diesel|gasoline|petrol)\b/i, icon: "⛽" },
  { pattern: /\b(medical|hospital|healthcare|disease|outbreak|casualt)/i, icon: "🏥" },
  { pattern: /\b(vaccin|immuniz|immunis)/i, icon: "💉" },
  { pattern: /\b(health monitoring|surveillance)/i, icon: "🩺" },
  { pattern: /\b(emergency supplies|non.?food items|nfi)\b/i, icon: "📦" },
];

export function normalizeHumanitarianNeedKey(needType: string): string {
  return canonicalNeedKey(needType);
}

export function getHumanitarianNeedIcon(needType: string): string {
  const canonical = normaliseNeedName(needType);
  const key = normalizeHumanitarianNeedKey(canonical);
  if (!key) return HUMANITARIAN_NEED_FALLBACK_ICON;

  const exact = EXACT_ICON_MAP[key];
  if (exact) return exact;

  for (const rule of KEYWORD_ICON_RULES) {
    if (rule.pattern.test(canonical)) return rule.icon;
  }

  return HUMANITARIAN_NEED_FALLBACK_ICON;
}

export function formatHumanitarianNeedWithIcon(needType: string): string {
  const canonical = normaliseNeedName(needType);
  return `${getHumanitarianNeedIcon(canonical)} ${canonical}`;
}

export function formatHumanitarianNeedsList(needTypes: string[], separator = ", "): string {
  if (needTypes.length === 0) return "";
  return needTypes.map((needType) => formatHumanitarianNeedWithIcon(needType)).join(separator);
}
