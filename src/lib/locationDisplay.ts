import { isBlacklistedLocationName } from "@/lib/locationBlacklist";

export interface LocationParts {
  city: string;
  country: string;
  display: string;
  precision?: "exact" | "approximate" | "regional" | "country" | "pending";
}

export const LOCATION_LABELS = {
  APPROXIMATE: "Approximate Location",
  ESTIMATED: "Estimated Region",
  AWAITING: "Awaiting Geolocation Verification",
  VERIFIED: "Location verified",
  COUNTRY_CENTROID: "Approximate country-level location",
  PENDING: "Location pending verification",
} as const;

const UNVERIFIED_ALIASES = new Set([
  "unknown location",
  "location not verified",
  "location could not yet be verified",
  "unknown",
  "unknown region",
  "unverified",
  "—",
  "",
]);

const LOCATION_COUNTRY_LOOKUP: Record<string, LocationParts> = {
  khartoum: { city: "Khartoum", country: "Sudan", display: "Khartoum, Sudan", precision: "exact" },
  omdurman: { city: "Omdurman", country: "Sudan", display: "Omdurman, Sudan", precision: "exact" },
  "wad madani": { city: "Wad Madani", country: "Sudan", display: "Wad Madani, Sudan", precision: "exact" },
  "el fasher": { city: "El Fasher", country: "Sudan", display: "El Fasher, Sudan", precision: "exact" },
  sudan: { city: "", country: "Sudan", display: "Sudan", precision: "country" },
  aleppo: { city: "Aleppo", country: "Syria", display: "Aleppo, Syria", precision: "exact" },
  idlib: { city: "Idlib", country: "Syria", display: "Idlib, Syria", precision: "exact" },
  hama: { city: "Hama", country: "Syria", display: "Hama, Syria", precision: "exact" },
  syria: { city: "", country: "Syria", display: "Syria", precision: "country" },
  gaza: { city: "Gaza", country: "Palestine", display: "Gaza, Palestine", precision: "exact" },
  palestine: { city: "", country: "Palestine", display: "Palestine", precision: "country" },
  baghdad: { city: "Baghdad", country: "Iraq", display: "Baghdad, Iraq", precision: "exact" },
  iraq: { city: "", country: "Iraq", display: "Iraq", precision: "country" },
  kyiv: { city: "Kyiv", country: "Ukraine", display: "Kyiv, Ukraine", precision: "exact" },
  kiev: { city: "Kyiv", country: "Ukraine", display: "Kyiv, Ukraine", precision: "exact" },
  ukraine: { city: "", country: "Ukraine", display: "Ukraine", precision: "country" },
  mariupol: { city: "Mariupol", country: "Ukraine", display: "Mariupol, Ukraine", precision: "exact" },
  haiti: { city: "", country: "Haiti", display: "Haiti", precision: "country" },
  "port-au-prince": {
    city: "Port-au-Prince",
    country: "Haiti",
    display: "Port-au-Prince, Haiti",
    precision: "exact",
  },
  yemen: { city: "", country: "Yemen", display: "Yemen", precision: "country" },
  somalia: { city: "", country: "Somalia", display: "Somalia", precision: "country" },
};

function isUnknownCountry(country: string): boolean {
  const lower = country.trim().toLowerCase();
  return !country.trim() || UNVERIFIED_ALIASES.has(lower);
}

export function isUnverifiedLocationLabel(value: string): boolean {
  return UNVERIFIED_ALIASES.has(value.trim().toLowerCase());
}

function normalizePart(value: string): string {
  const trimmed = value?.trim() ?? "";
  return isUnverifiedLocationLabel(trimmed) ? "" : trimmed;
}

/** Single-line location for cards, alerts, and lists. */
export function formatIncidentLocation(
  city: string,
  country?: string | null
): string | null {
  const cityTrim = normalizePart(city);
  const countryTrim = normalizePart(country ?? "");

  if (!cityTrim && !countryTrim) {
    return null;
  }

  if (cityTrim && countryTrim) {
    if (cityTrim.toLowerCase() === countryTrim.toLowerCase()) {
      return cityTrim;
    }
    return `${cityTrim}, ${countryTrim}`;
  }

  return cityTrim || countryTrim;
}

/** Format alert/API location fields for UI display. */
export function formatAlertLocation(city: string, country: string): string {
  const formatted = formatIncidentLocation(city, country);
  if (formatted) return formatted;
  return LOCATION_LABELS.AWAITING;
}

export function resolveLocationParts(
  name: string,
  confidence?: number
): LocationParts & { verified: boolean } {
  const trimmed = name.trim();

  if (!trimmed || isBlacklistedLocationName(trimmed)) {
    return {
      city: "",
      country: "",
      display: LOCATION_LABELS.AWAITING,
      precision: "pending",
      verified: false,
    };
  }

  if (confidence !== undefined && confidence < 0.35) {
    const key = trimmed.toLowerCase();
    const countryOnly = LOCATION_COUNTRY_LOOKUP[key];
    if (countryOnly?.precision === "country") {
      return { ...countryOnly, verified: false };
    }
    return {
      city: "",
      country: "",
      display: LOCATION_LABELS.AWAITING,
      precision: "pending",
      verified: false,
    };
  }

  if (trimmed.includes(",")) {
    const [cityPart, ...rest] = trimmed.split(",");
    const city = cityPart.trim();
    const country = rest.join(",").trim();
    if (isUnknownCountry(country) || isBlacklistedLocationName(city)) {
      if (city && !isBlacklistedLocationName(city)) {
        return {
          city,
          country: "",
          display: `${LOCATION_LABELS.APPROXIMATE}: ${city}`,
          precision: "approximate",
          verified: false,
        };
      }
      return {
        city: "",
        country: "",
        display: LOCATION_LABELS.ESTIMATED,
        precision: "regional",
        verified: false,
      };
    }
    return {
      city,
      country,
      display: `${city}, ${country}`,
      precision: confidence !== undefined && confidence < 0.7 ? "approximate" : "exact",
      verified: confidence === undefined || confidence >= 0.5,
    };
  }

  const key = trimmed.toLowerCase();
  const direct = LOCATION_COUNTRY_LOOKUP[key];
  if (direct) {
    return {
      ...direct,
      verified: direct.precision === "country" ? false : confidence === undefined || confidence >= 0.5,
    };
  }

  for (const [lookupKey, parts] of Object.entries(LOCATION_COUNTRY_LOOKUP)) {
    if (key.includes(lookupKey) || lookupKey.includes(key)) {
      return {
        ...parts,
        verified: parts.precision !== "country" && (confidence === undefined || confidence >= 0.5),
      };
    }
  }

  if (trimmed.startsWith("Coordinates")) {
    return {
      city: "",
      country: "",
      display: LOCATION_LABELS.APPROXIMATE,
      precision: "approximate",
      verified: false,
    };
  }

  const lowConfidence = confidence !== undefined && confidence < 0.7;
  return {
    city: trimmed,
    country: "",
    display: lowConfidence
      ? `${LOCATION_LABELS.APPROXIMATE}: ${trimmed}`
      : trimmed,
    precision: lowConfidence ? "approximate" : "regional",
    verified: false,
  };
}

export function formatLocationDisplay(
  name: string,
  confidence?: number
): string {
  return resolveLocationParts(name, confidence).display;
}

export function formatCityCountry(city: string, country: string): string {
  return formatIncidentLocation(city, country) ?? LOCATION_LABELS.AWAITING;
}
