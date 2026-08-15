import { resolveLocationParts } from "@/lib/locationDisplay";

/** ISO 3166-1 alpha-2 codes keyed by normalised country / territory names and aliases. */
const NAME_TO_ISO: Record<string, string> = {
  afghanistan: "AF",
  albania: "AL",
  algeria: "DZ",
  andorra: "AD",
  angola: "AO",
  "antigua and barbuda": "AG",
  argentina: "AR",
  armenia: "AM",
  australia: "AU",
  austria: "AT",
  azerbaijan: "AZ",
  bahamas: "BS",
  bahrain: "BH",
  bangladesh: "BD",
  barbados: "BB",
  belarus: "BY",
  belgium: "BE",
  belize: "BZ",
  benin: "BJ",
  bhutan: "BT",
  bolivia: "BO",
  "bosnia and herzegovina": "BA",
  botswana: "BW",
  brazil: "BR",
  brunei: "BN",
  bulgaria: "BG",
  "burkina faso": "BF",
  burundi: "BI",
  cambodia: "KH",
  cameroon: "CM",
  canada: "CA",
  "cape verde": "CV",
  "central african republic": "CF",
  car: "CF",
  chad: "TD",
  chile: "CL",
  china: "CN",
  colombia: "CO",
  comoros: "KM",
  congo: "CG",
  "republic of the congo": "CG",
  "congo-brazzaville": "CG",
  "costa rica": "CR",
  croatia: "HR",
  cuba: "CU",
  cyprus: "CY",
  czechia: "CZ",
  "czech republic": "CZ",
  "democratic republic of the congo": "CD",
  "dr congo": "CD",
  drc: "CD",
  "congo-kinshasa": "CD",
  denmark: "DK",
  djibouti: "DJ",
  dominica: "DM",
  "dominican republic": "DO",
  ecuador: "EC",
  egypt: "EG",
  "el salvador": "SV",
  "equatorial guinea": "GQ",
  eritrea: "ER",
  estonia: "EE",
  eswatini: "SZ",
  swaziland: "SZ",
  ethiopia: "ET",
  fiji: "FJ",
  finland: "FI",
  france: "FR",
  gabon: "GA",
  gambia: "GM",
  georgia: "GE",
  germany: "DE",
  ghana: "GH",
  greece: "GR",
  grenada: "GD",
  guatemala: "GT",
  guinea: "GN",
  "guinea-bissau": "GW",
  guyana: "GY",
  haiti: "HT",
  honduras: "HN",
  hungary: "HU",
  iceland: "IS",
  india: "IN",
  indonesia: "ID",
  iran: "IR",
  iraq: "IQ",
  ireland: "IE",
  israel: "IL",
  italy: "IT",
  "ivory coast": "CI",
  "côte d'ivoire": "CI",
  "cote d'ivoire": "CI",
  jamaica: "JM",
  japan: "JP",
  jordan: "JO",
  kazakhstan: "KZ",
  kenya: "KE",
  kiribati: "KI",
  kosovo: "XK",
  kuwait: "KW",
  kyrgyzstan: "KG",
  laos: "LA",
  latvia: "LV",
  lebanon: "LB",
  lesotho: "LS",
  liberia: "LR",
  libya: "LY",
  liechtenstein: "LI",
  lithuania: "LT",
  luxembourg: "LU",
  madagascar: "MG",
  malawi: "MW",
  malaysia: "MY",
  maldives: "MV",
  mali: "ML",
  malta: "MT",
  "marshall islands": "MH",
  mauritania: "MR",
  mauritius: "MU",
  mexico: "MX",
  micronesia: "FM",
  moldova: "MD",
  monaco: "MC",
  mongolia: "MN",
  montenegro: "ME",
  morocco: "MA",
  mozambique: "MZ",
  myanmar: "MM",
  burma: "MM",
  namibia: "NA",
  nauru: "NR",
  nepal: "NP",
  netherlands: "NL",
  "new zealand": "NZ",
  nicaragua: "NI",
  niger: "NE",
  nigeria: "NG",
  "north korea": "KP",
  "north macedonia": "MK",
  macedonia: "MK",
  norway: "NO",
  oman: "OM",
  pakistan: "PK",
  palau: "PW",
  palestine: "PS",
  gaza: "PS",
  "gaza strip": "PS",
  "west bank": "PS",
  panama: "PA",
  "papua new guinea": "PG",
  paraguay: "PY",
  peru: "PE",
  philippines: "PH",
  poland: "PL",
  portugal: "PT",
  qatar: "QA",
  romania: "RO",
  russia: "RU",
  "russian federation": "RU",
  rwanda: "RW",
  "saint kitts and nevis": "KN",
  "saint lucia": "LC",
  "saint vincent and the grenadines": "VC",
  samoa: "WS",
  "san marino": "SM",
  "sao tome and principe": "ST",
  "saudi arabia": "SA",
  senegal: "SN",
  serbia: "RS",
  seychelles: "SC",
  "sierra leone": "SL",
  singapore: "SG",
  slovakia: "SK",
  slovenia: "SI",
  "solomon islands": "SB",
  somalia: "SO",
  "south africa": "ZA",
  "south korea": "KR",
  "south sudan": "SS",
  spain: "ES",
  "sri lanka": "LK",
  sudan: "SD",
  suriname: "SR",
  sweden: "SE",
  switzerland: "CH",
  syria: "SY",
  taiwan: "TW",
  tajikistan: "TJ",
  tanzania: "TZ",
  thailand: "TH",
  "timor-leste": "TL",
  "east timor": "TL",
  togo: "TG",
  tonga: "TO",
  "trinidad and tobago": "TT",
  tunisia: "TN",
  turkey: "TR",
  türkiye: "TR",
  turkmenistan: "TM",
  tuvalu: "TV",
  uganda: "UG",
  ukraine: "UA",
  "united arab emirates": "AE",
  uae: "AE",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "united states": "US",
  usa: "US",
  "united states of america": "US",
  uruguay: "UY",
  uzbekistan: "UZ",
  vanuatu: "VU",
  vatican: "VA",
  "vatican city": "VA",
  venezuela: "VE",
  vietnam: "VN",
  "viet nam": "VN",
  yemen: "YE",
  zambia: "ZM",
  zimbabwe: "ZW",
};

const FALLBACK_FLAG = "🌍";

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isoToFlagEmoji(iso: string): string {
  if (!iso || iso.length !== 2) return FALLBACK_FLAG;
  const upper = iso.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return FALLBACK_FLAG;
  return String.fromCodePoint(
    ...[...upper].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65)
  );
}

export function lookupCountryIso(country: string): string | null {
  const key = normalizeKey(country);
  if (!key) return null;
  if (NAME_TO_ISO[key]) return NAME_TO_ISO[key];

  for (const [name, iso] of Object.entries(NAME_TO_ISO)) {
    if (key === name || key.includes(name) || name.includes(key)) {
      return iso;
    }
  }

  return null;
}

/** Resolve a canonical country name from free text or "City, Country" strings. */
export function extractCountryName(input: string): string | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;

  const parts = resolveLocationParts(trimmed);
  if (parts.country) return parts.country;

  if (lookupCountryIso(trimmed)) return trimmed;

  if (trimmed.includes(",")) {
    const countryPart = trimmed.split(",").pop()?.trim();
    if (countryPart && lookupCountryIso(countryPart)) return countryPart;
  }

  const sortedNames = Object.keys(NAME_TO_ISO).sort((a, b) => b.length - a.length);
  const lower = trimmed.toLowerCase();
  for (const name of sortedNames) {
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(lower)) {
      return name.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  return null;
}

export function getCountryFlagEmoji(input: string): string {
  const country = extractCountryName(input);
  if (!country) return FALLBACK_FLAG;
  const iso = lookupCountryIso(country);
  return iso ? isoToFlagEmoji(iso) : FALLBACK_FLAG;
}

/** Plain text: "🇸🇩 Sudan" */
export function formatCountryWithFlag(country: string): string {
  const trimmed = country?.trim();
  if (!trimmed || trimmed === "—") return trimmed || "—";
  const flag = getCountryFlagEmoji(trimmed);
  return `${flag} ${trimmed}`;
}

/** Plain text: flag before a location line such as "Khartoum, Sudan". */
export function formatLocationWithFlag(location: string): string {
  const trimmed = location?.trim();
  if (!trimmed) return trimmed;
  const flag = getCountryFlagEmoji(trimmed);
  return `${flag} ${trimmed}`;
}
