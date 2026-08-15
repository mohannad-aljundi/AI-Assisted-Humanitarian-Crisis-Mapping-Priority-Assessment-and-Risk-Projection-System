import { isBlacklistedLocationName } from "@/lib/locationBlacklist";

export interface NormalizedPlace {
  display: string;
  city: string;
  country: string;
}

const PLACE_ALIASES: Record<string, NormalizedPlace> = {
  nyc: { city: "New York City", country: "United States", display: "New York City, United States" },
  "new york": { city: "New York City", country: "United States", display: "New York City, United States" },
  "new york city": { city: "New York City", country: "United States", display: "New York City, United States" },
  "gaza strip": { city: "Gaza", country: "Palestine", display: "Gaza, Palestine" },
  gaza: { city: "Gaza", country: "Palestine", display: "Gaza, Palestine" },
  palestine: { city: "Gaza", country: "Palestine", display: "Gaza, Palestine" },
  "khartoum state": { city: "Khartoum", country: "Sudan", display: "Khartoum, Sudan" },
  khartoum: { city: "Khartoum", country: "Sudan", display: "Khartoum, Sudan" },
  omdurman: { city: "Omdurman", country: "Sudan", display: "Omdurman, Sudan" },
  "wad madani": { city: "Wad Madani", country: "Sudan", display: "Wad Madani, Sudan" },
  "el fasher": { city: "El Fasher", country: "Sudan", display: "El Fasher, Sudan" },
  sudan: { city: "Khartoum", country: "Sudan", display: "Khartoum, Sudan" },
  aleppo: { city: "Aleppo", country: "Syria", display: "Aleppo, Syria" },
  idlib: { city: "Idlib", country: "Syria", display: "Idlib, Syria" },
  hama: { city: "Hama", country: "Syria", display: "Hama, Syria" },
  syria: { city: "Aleppo", country: "Syria", display: "Aleppo, Syria" },
  baghdad: { city: "Baghdad", country: "Iraq", display: "Baghdad, Iraq" },
  iraq: { city: "Baghdad", country: "Iraq", display: "Baghdad, Iraq" },
  kyiv: { city: "Kyiv", country: "Ukraine", display: "Kyiv, Ukraine" },
  kiev: { city: "Kyiv", country: "Ukraine", display: "Kyiv, Ukraine" },
  mariupol: { city: "Mariupol", country: "Ukraine", display: "Mariupol, Ukraine" },
  ukraine: { city: "Kyiv", country: "Ukraine", display: "Kyiv, Ukraine" },
  haiti: { city: "Port-au-Prince", country: "Haiti", display: "Port-au-Prince, Haiti" },
  "port-au-prince": { city: "Port-au-Prince", country: "Haiti", display: "Port-au-Prince, Haiti" },
  yemen: { city: "Sana'a", country: "Yemen", display: "Sana'a, Yemen" },
  somalia: { city: "Mogadishu", country: "Somalia", display: "Mogadishu, Somalia" },
  mogadishu: { city: "Mogadishu", country: "Somalia", display: "Mogadishu, Somalia" },
  afghanistan: { city: "Kabul", country: "Afghanistan", display: "Kabul, Afghanistan" },
  kabul: { city: "Kabul", country: "Afghanistan", display: "Kabul, Afghanistan" },
};

const ORGANISATION_PATTERNS =
  /\b(red cross|ifrc|unicef|who|unhcr|wfp|ocha|ngo|nato|un\b|nations)\b/i;

export function normalizePlaceName(raw: string): NormalizedPlace | null {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed || isBlacklistedLocationName(trimmed)) return null;
  if (ORGANISATION_PATTERNS.test(trimmed)) return null;

  const key = trimmed.toLowerCase();
  const direct = PLACE_ALIASES[key];
  if (direct) return direct;

  for (const [alias, place] of Object.entries(PLACE_ALIASES)) {
    if (key.includes(alias) || alias.includes(key)) return place;
  }

  if (trimmed.includes(",")) {
    const [city, ...rest] = trimmed.split(",");
    const country = rest.join(",").trim();
    if (city && country && !isBlacklistedLocationName(city)) {
      return { city: city.trim(), country, display: `${city.trim()}, ${country}` };
    }
  }

  return null;
}

export function cleanLocationCandidate(raw: string): string | null {
  const normalized = normalizePlaceName(raw);
  return normalized?.display ?? null;
}
