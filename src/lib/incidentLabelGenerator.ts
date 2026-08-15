import type { PriorityLevel } from "@prisma/client";
import { normaliseNeedName } from "@/lib/humanitarianNeedTaxonomy";

export interface IncidentLabelInput {
  headline: string;
  content?: string;
  crisisType?: string | null;
  location?: string | null;
  country?: string | null;
  humanitarianNeeds?: string[];
  priorityLevel?: PriorityLevel | null;
}

const MAX_LABEL_WORDS = 3;

const COUNTRY_ALIASES: Record<string, string> = {
  uk: "UK",
  usa: "USA",
  us: "USA",
  uae: "UAE",
  drc: "DRC",
};

function titleCaseWord(word: string): string {
  const lower = word.toLowerCase();
  if (COUNTRY_ALIASES[lower]) {
    return COUNTRY_ALIASES[lower];
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function normalizeIncidentLabel(label: string): string {
  const words = label
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_LABEL_WORDS);

  if (words.length === 0) {
    return "Humanitarian Crisis";
  }

  return words.map(titleCaseWord).join(" ");
}

export function extractCountryName(
  location?: string | null,
  country?: string | null
): string | null {
  const raw = (country ?? location ?? "").trim();
  if (!raw) return null;

  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  const candidate = parts.length > 1 ? parts[parts.length - 1]! : parts[0]!;
  if (candidate.length < 2 || candidate.length > 32) {
    return null;
  }

  return titleCaseWord(candidate);
}

function textBlob(input: IncidentLabelInput): string {
  return [input.headline, input.content, input.crisisType, input.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function detectEventPhrase(blob: string, crisisType?: string | null): string | null {
  const crisis = (crisisType ?? "").toLowerCase();

  if (/\bcholera\b/.test(blob) || crisis.includes("cholera")) return "Cholera Outbreak";
  if (
    /\bearthquake\b|\bseismic\b|\bquake\b|\bmagnitude\s+\d/.test(blob) ||
    crisis.includes("earthquake")
  ) {
    return "Earthquake";
  }
  if (/\bflood|\bflooding\b/.test(blob) || crisis.includes("flood")) return "Flood Emergency";
  if (/\bdrought\b/.test(blob) || crisis.includes("drought")) return "Drought";
  if (/\bairstrike\b|\bair strike\b/.test(blob)) return "Airstrike";
  if (/\brefugee\b|\bdisplaced\b|\bdisplacement\b/.test(blob)) return "Displacement";
  if (/\bhospital\b.*\b(collaps|destroy|damage)/.test(blob)) return "Hospital Collapse";
  if (/\bconflict\b|\bwar\b|\bfighting\b|\batrocit/.test(blob) || crisis.includes("conflict")) {
    return "Conflict";
  }
  if (/\bwater shortage\b|\bwater crisis\b/.test(blob) || crisis.includes("water")) {
    return "Water Shortage";
  }
  if (crisis.includes("natural")) return "Natural Disaster";
  if (crisis.includes("disease") || crisis.includes("outbreak")) return "Disease Outbreak";

  return null;
}

function needToLabel(need: string): string | null {
  const canonical = normaliseNeedName(need);
  const lower = canonical.toLowerCase();

  if (lower.includes("medical") || lower.includes("trauma") || lower.includes("health")) {
    return "Medical Emergency";
  }
  if (lower.includes("water")) return "Water Shortage";
  if (lower.includes("food")) return "Food Crisis";
  if (lower.includes("shelter") || lower.includes("displacement")) return "Refugee Displacement";
  if (lower.includes("sanitation") || lower.includes("hygiene")) return "Sanitation Crisis";
  if (lower.includes("protection")) return "Protection Crisis";
  if (lower.includes("disease") || lower.includes("vaccination")) return "Disease Outbreak";
  if (lower.includes("search") || lower.includes("rescue")) return "Search Emergency";
  if (lower.includes("power") || lower.includes("electric")) return "Power Outage";
  if (lower.includes("fuel")) return "Fuel Shortage";
  if (lower.includes("education")) return "Education Crisis";

  return null;
}

function pickPrimaryNeed(needs: string[] | undefined): string | null {
  if (!needs?.length) return null;
  return needs.map(normaliseNeedName).find(Boolean) ?? needs[0] ?? null;
}

export function generateRuleBasedIncidentLabel(input: IncidentLabelInput): string {
  const blob = textBlob(input);
  const country = extractCountryName(input.location, input.country);
  const event = detectEventPhrase(blob, input.crisisType);
  const need = pickPrimaryNeed(input.humanitarianNeeds);
  const needLabel = need ? needToLabel(need) : null;

  if (
    needLabel === "Medical Emergency" &&
    /\b(medic|medical|infection|injur|hospital|health)\b/.test(blob)
  ) {
    return normalizeIncidentLabel(needLabel);
  }

  if (country && event) {
    if (event === "Conflict" || event === "Earthquake" || event === "Airstrike" || event === "Drought") {
      return normalizeIncidentLabel(`${country} ${event}`);
    }
    if (event === "Displacement") {
      return normalizeIncidentLabel(`${country} Displacement`);
    }
    return normalizeIncidentLabel(`${country} ${event.split(" ")[0]}`);
  }

  if (needLabel && (!event || needLabel !== "Medical Emergency")) {
    if (country && needLabel === "Refugee Displacement") {
      return normalizeIncidentLabel(`${country} Displacement`);
    }
    return normalizeIncidentLabel(needLabel);
  }

  if (country && input.crisisType) {
    const crisisWord = input.crisisType.split(/[\s/]+/)[0] ?? "Crisis";
    return normalizeIncidentLabel(`${country} ${crisisWord}`);
  }

  if (event) {
    return normalizeIncidentLabel(event);
  }

  if (needLabel) {
    return normalizeIncidentLabel(needLabel);
  }

  if (input.priorityLevel === "Critical" || input.priorityLevel === "High") {
    return "Humanitarian Emergency";
  }

  return "Humanitarian Crisis";
}

export function deriveIncidentLabelFallback(input: IncidentLabelInput): string {
  return generateRuleBasedIncidentLabel(input);
}
