import type {
  ExtractedHumanitarianNeed,
  ExtractedLocation,
  NLPAnalysisResult,
} from "@/types";
import { isBlacklistedLocationName } from "@/lib/locationBlacklist";
import { NEED_INFERENCE_RULES } from "@/lib/intelligenceConstants";
import {
  canonicalNeedKey,
  normaliseNeedName,
} from "@/lib/humanitarianNeedTaxonomy";

const CRISIS_KEYWORDS: Record<string, string[]> = {
  Earthquake: ["earthquake", "earthquakes", "seismic", "tremor", "aftershock"],
  Flood: ["flood", "flooding", "inundation", "flash flood", "river overflow"],
  Conflict: ["conflict", "armed clash", "fighting", "war", "shelling", "airstrike"],
  Drought: ["drought", "water shortage", "crop failure"],
  Disease: ["outbreak", "epidemic", "cholera", "disease", "infection", "pandemic"],
  Displacement: ["displaced", "refugee", "evacuation", "internally displaced", "idp"],
  Wildfire: ["wildfire", "bushfire", "forest fire", "fire outbreak"],
  Storm: ["hurricane", "cyclone", "typhoon", "storm", "landslide"],
  "Food Insecurity": ["food insecurity", "famine", "malnutrition", "starvation", "hunger crisis"],
  "Humanitarian Crisis": [
    "humanitarian crisis",
    "humanitarian emergency",
    "humanitarian situation",
    "gaza updates",
    "delivers aid",
    "aid delivery",
  ],
  "Infrastructure Damage": [
    "infrastructure damage",
    "bridge collapsed",
    "hospital destroyed",
    "school destroyed",
    "power outage",
    "roads blocked",
  ],
};

const NEED_KEYWORDS: Record<string, { keywords: string[]; severityHints: Record<string, "Low" | "Medium" | "High" | "Critical"> }> = {
  "Medical Aid": {
    keywords: ["medical", "healthcare", "hospital", "injured", "casualties", "medicine", "surgical"],
    severityHints: { casualties: "Critical", injured: "High", medical: "High", hospital: "Medium" },
  },
  Food: {
    keywords: ["food", "nutrition", "malnutrition", "starvation", "hunger", "famine"],
    severityHints: { starvation: "Critical", famine: "Critical", malnutrition: "High", hunger: "Medium", food: "Medium" },
  },
  Water: {
    keywords: ["water", "sanitation", "hygiene", "clean water", "drinking water", "wash"],
    severityHints: { "clean water": "High", water: "Medium", sanitation: "Medium" },
  },
  Shelter: {
    keywords: ["shelter", "housing", "camp", "homeless", "temporary accommodation"],
    severityHints: { homeless: "High", shelter: "Medium", camp: "Medium" },
  },
  "Search & Rescue": {
    keywords: ["search and rescue", "trapped", "buried", "rubble", "rescue teams"],
    severityHints: { trapped: "Critical", rubble: "High", "search and rescue": "Critical" },
  },
  Flooding: {
    keywords: ["flood", "flooding", "inundation", "flash flood"],
    severityHints: { flooding: "Critical", flood: "High" },
  },
  Infrastructure: {
    keywords: ["infrastructure", "bridge collapsed", "roads blocked", "building destroyed"],
    severityHints: { "bridge collapsed": "High", infrastructure: "Medium" },
  },
  "Power/Electricity": {
    keywords: ["power outage", "electricity", "blackout", "grid failure"],
    severityHints: { blackout: "High", "power outage": "High", electricity: "Medium" },
  },
  Fuel: {
    keywords: ["fuel shortage", "diesel shortage", "gasoline", "petrol shortage"],
    severityHints: { "fuel shortage": "High", fuel: "Medium" },
  },
  Communication: {
    keywords: ["communication", "connectivity", "telecom", "internet", "phone network"],
    severityHints: { connectivity: "High", communication: "Medium" },
  },
  Logistics: {
    keywords: ["logistics", "supply chain", "aid delivery", "access routes", "blocked roads"],
    severityHints: { "aid delivery": "High", logistics: "Medium" },
  },
  "Psychological Support": {
    keywords: ["psychological", "mental health", "trauma", "counselling", "counseling"],
    severityHints: { trauma: "High", psychological: "Medium" },
  },
  "Disease Outbreak": {
    keywords: ["outbreak", "epidemic", "cholera", "disease", "infection", "pandemic"],
    severityHints: { epidemic: "Critical", outbreak: "High", cholera: "Critical" },
  },
  "Child Protection": {
    keywords: ["child protection", "unaccompanied children", "minors", "children at risk"],
    severityHints: { "child protection": "Critical", "unaccompanied children": "High" },
  },
  Protection: {
    keywords: ["protection", "violence", "abuse", "gender-based violence", "gbv"],
    severityHints: { violence: "Critical", protection: "High" },
  },
  "Displacement Support": {
    keywords: ["displaced", "refugee", "evacuat", "idp", "fled", "displacement"],
    severityHints: { displaced: "High", refugee: "High", displacement: "Critical" },
  },
  Education: {
    keywords: ["school", "education", "university", "students", "learning"],
    severityHints: { school: "Medium", education: "Medium" },
  },
};

const KNOWN_LOCATIONS: Record<string, { latitude: number; longitude: number }> = {
  gaza: { latitude: 31.5, longitude: 34.4667 },
  ukraine: { latitude: 48.3794, longitude: 31.1656 },
  syria: { latitude: 34.8021, longitude: 38.9968 },
  sudan: { latitude: 15.5007, longitude: 32.5599 },
  haiti: { latitude: 18.9712, longitude: -72.2852 },
  yemen: { latitude: 15.5527, longitude: 48.5164 },
  somalia: { latitude: 5.1521, longitude: 46.1996 },
  "port-au-prince": { latitude: 18.5944, longitude: -72.3074 },
  khartoum: { latitude: 15.5007, longitude: 32.5599 },
  omdurman: { latitude: 15.645, longitude: 32.4777 },
  "wad madani": { latitude: 14.401, longitude: 33.52 },
  "el fasher": { latitude: 13.628, longitude: 25.349 },
  aleppo: { latitude: 36.2021, longitude: 37.1343 },
  idlib: { latitude: 35.9306, longitude: 36.6339 },
  hama: { latitude: 35.1318, longitude: 36.7578 },
  mariupol: { latitude: 47.0971, longitude: 37.5434 },
};

export class NLPService {
  analyse(content: string): NLPAnalysisResult {
    const normalised = content.toLowerCase();

    return {
      locations: this.extractLocations(content, normalised),
      crisisType: this.extractCrisisType(normalised),
      humanitarianNeeds: this.extractHumanitarianNeeds(content, normalised),
      affectedPopulation: this.extractAffectedPopulation(content),
    };
  }

  private extractLocations(
    originalContent: string,
    normalised: string
  ): ExtractedLocation[] {
    const locations: ExtractedLocation[] = [];
    const seen = new Set<string>();

    for (const [name, coords] of Object.entries(KNOWN_LOCATIONS)) {
      if (normalised.includes(name) && !seen.has(name)) {
        seen.add(name);
        locations.push({
          name: this.toTitleCase(name),
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      }
    }

    let match: RegExpExecArray | null;
    const capitalisedPattern = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g;
    while ((match = capitalisedPattern.exec(originalContent)) !== null) {
      const candidate = match[1].trim();
      const key = candidate.toLowerCase();
      if (
        candidate.length > 2 &&
        !seen.has(key) &&
        !this.isCommonWord(candidate) &&
        !isBlacklistedLocationName(candidate)
      ) {
        seen.add(key);
        const known = KNOWN_LOCATIONS[key];
        locations.push({
          name: candidate,
          latitude: known?.latitude ?? null,
          longitude: known?.longitude ?? null,
        });
      }
    }

    return locations.slice(0, 10);
  }

  private extractCrisisType(normalised: string): string | null {
    let bestType: string | null = null;
    let bestScore = 0;

    for (const [crisisType, keywords] of Object.entries(CRISIS_KEYWORDS)) {
      const score = keywords.reduce(
        (total, keyword) => total + (normalised.includes(keyword) ? 1 : 0),
        0
      );
      if (score > bestScore) {
        bestScore = score;
        bestType = crisisType;
      }
    }

    return bestType;
  }

  private extractHumanitarianNeeds(
    content: string,
    normalised: string
  ): ExtractedHumanitarianNeed[] {
    const needs: ExtractedHumanitarianNeed[] = [];
    const seen = new Set<string>();

    for (const rule of NEED_INFERENCE_RULES) {
      if (rule.pattern.test(content)) {
        const canonical = normaliseNeedName(rule.need);
        const key = canonicalNeedKey(canonical);
        if (!seen.has(key)) {
          seen.add(key);
          needs.push({
            needType: canonical,
            severity: "High",
            reason: rule.reason,
          });
        }
      }
    }

    for (const [needType, config] of Object.entries(NEED_KEYWORDS)) {
      const matchedKeywords = config.keywords.filter((keyword) =>
        normalised.includes(keyword)
      );

      if (matchedKeywords.length === 0) {
        continue;
      }

      const canonical = normaliseNeedName(needType);
      const key = canonicalNeedKey(canonical);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      let severity: ExtractedHumanitarianNeed["severity"] = "Medium";
      for (const [hint, level] of Object.entries(config.severityHints)) {
        if (normalised.includes(hint)) {
          severity = level;
          break;
        }
      }

      if (normalised.includes("urgent") || normalised.includes("critical")) {
        severity = "Critical";
      } else if (normalised.includes("severe")) {
        severity = "High";
      }

      needs.push({ needType: canonical, severity });
    }

    return needs;
  }

  private extractAffectedPopulation(content: string): number | null {
    let maxPopulation = 0;

    const magnitudePattern =
      /(\d+(?:\.\d+)?)\s*(million|mln|billion|thousand|k)\b[^.]{0,40}?\b(?:people|persons|individuals|residents|displaced|affected|in\s+need)\b/gi;
    let magnitudeMatch: RegExpExecArray | null;
    while ((magnitudeMatch = magnitudePattern.exec(content)) !== null) {
      const value = this.parseMagnitudeValue(
        magnitudeMatch[1],
        magnitudeMatch[2]
      );
      if (value > maxPopulation) maxPopulation = value;
    }

    const reverseMagnitudePattern =
      /(\d+(?:\.\d+)?)\s*(million|mln|billion|thousand|k)\s+people\b/gi;
    while ((magnitudeMatch = reverseMagnitudePattern.exec(content)) !== null) {
      const value = this.parseMagnitudeValue(
        magnitudeMatch[1],
        magnitudeMatch[2]
      );
      if (value > maxPopulation) maxPopulation = value;
    }

    const patterns = [
      /(\d[\d,]*)\s*(?:people|persons|individuals|residents|families|households|displaced|affected|casualties|injured|dead|deaths|killed)/gi,
      /(?:approximately|about|around|over|nearly|up to|some)\s+(\d[\d,]*)/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const value = parseInt(match[1].replace(/,/g, ""), 10);
        if (!Number.isNaN(value) && value > maxPopulation) {
          maxPopulation = value;
        }
      }
    }

    return maxPopulation > 0 ? maxPopulation : null;
  }

  private parseMagnitudeValue(raw: string, unit: string): number {
    const base = parseFloat(raw.replace(/,/g, ""));
    if (Number.isNaN(base)) return 0;

    const normalised = unit.toLowerCase();
    if (normalised.startsWith("billion")) return Math.round(base * 1_000_000_000);
    if (normalised.startsWith("million") || normalised === "mln") {
      return Math.round(base * 1_000_000);
    }
    if (normalised.startsWith("thousand") || normalised === "k") {
      return Math.round(base * 1_000);
    }
    return Math.round(base);
  }

  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      "The",
      "A",
      "An",
      "In",
      "On",
      "At",
      "Report",
      "Reports",
      "United",
      "Nations",
      "Red",
      "Cross",
    ]);
    return commonWords.has(word);
  }

  private toTitleCase(value: string): string {
    return value
      .split(/[\s-]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
}

export const nlpService = new NLPService();
