/** Standard humanitarian crisis classification taxonomy. */
export const CRISIS_TAXONOMY = [
  "Conflict",
  "Flood",
  "Earthquake",
  "Wildfire",
  "Disease",
  "Medical Emergency",
  "Food Insecurity",
  "Displacement",
  "Shelter",
  "Infrastructure Damage",
  "Storm",
  "Drought",
  "Unknown",
] as const;

export type CrisisTaxonomy = (typeof CRISIS_TAXONOMY)[number];

/** Geographic and humanitarian facility entity subtypes. */
export const ENTITY_SUBTYPES = [
  "COUNTRY",
  "CITY",
  "VILLAGE",
  "RIVER",
  "HOSPITAL",
  "SCHOOL",
  "AIRPORT",
  "REFUGEE_CAMP",
  "ROAD",
  "PORT",
  "POWER_PLANT",
  "BRIDGE",
  "HUMANITARIAN_FACILITY",
] as const;

export type EntitySubtype = (typeof ENTITY_SUBTYPES)[number];

export const CRISIS_TYPE_ALIASES: Record<string, CrisisTaxonomy> = {
  "armed conflict": "Conflict",
  conflict: "Conflict",
  war: "Conflict",
  fighting: "Conflict",
  flooding: "Flood",
  flood: "Flood",
  earthquake: "Earthquake",
  seismic: "Earthquake",
  wildfire: "Wildfire",
  bushfire: "Wildfire",
  "forest fire": "Wildfire",
  fire: "Wildfire",
  "disease outbreak": "Disease",
  disease: "Disease",
  epidemic: "Disease",
  cholera: "Disease",
  "medical emergency": "Medical Emergency",
  "food insecurity": "Food Insecurity",
  famine: "Food Insecurity",
  displacement: "Displacement",
  refugee: "Displacement",
  shelter: "Shelter",
  "infrastructure damage": "Infrastructure Damage",
  hurricane: "Storm",
  cyclone: "Storm",
  typhoon: "Storm",
  storm: "Storm",
  landslide: "Storm",
  drought: "Drought",
  "humanitarian crisis": "Unknown",
  "humanitarian aid": "Unknown",
};

export const NEED_INFERENCE_RULES: Array<{
  pattern: RegExp;
  need: string;
  reason: string;
}> = [
  {
    pattern: /\bhospital(?:s)?\s+(?:destroyed|damaged|overwhelmed)\b/i,
    need: "Medical Aid",
    reason: "Hospital infrastructure damaged or overwhelmed",
  },
  {
    pattern: /\b(?:killed|deaths?|died|injured|wounded|casualt)\b/i,
    need: "Medical Aid",
    reason: "Casualties or injuries reported",
  },
  {
    pattern: /\bcollapsed?\s+buildings?\b|\bbuilding\s+collapse\b/i,
    need: "Search & Rescue",
    reason: "Building collapse requires search and rescue",
  },
  {
    pattern: /\bbridge(?:s)?\s+collapsed\b/i,
    need: "Infrastructure",
    reason: "Bridge collapse disrupts access and logistics",
  },
  {
    pattern: /\bsleeping\s+outdoors\b|\bwithout\s+shelter\b/i,
    need: "Shelter",
    reason: "Families lack adequate shelter",
  },
  {
    pattern: /\bno\s+clean\s+water\b|\bwater\s+contamination\b/i,
    need: "Water",
    reason: "Clean water access compromised",
  },
  {
    pattern: /\bfood\s+prices?\s+(?:doubled|tripled|soared)\b|\bfood\s+shortage\b/i,
    need: "Food",
    reason: "Food access deteriorating",
  },
  {
    pattern: /\bdisease\s+outbreak\b|\bepidemic\b|\bcholera\b/i,
    need: "Medical Aid",
    reason: "Disease outbreak requires medical response",
  },
  {
    pattern: /\bschool(?:s)?\s+(?:destroyed|closed|damaged)\b/i,
    need: "Education",
    reason: "Education facilities disrupted",
  },
  {
    pattern: /\bpower\s+(?:plant|station)\b.*\b(?:destroyed|offline)\b|\bblackout\b|\bpower\s+outage\b/i,
    need: "Power/Electricity",
    reason: "Power infrastructure failure",
  },
  {
    pattern: /\bhumanitarian\s+emergency\b|\bhumanitarian\s+crisis\b/i,
    need: "Humanitarian Coordination",
    reason: "Humanitarian emergency declared or described",
  },
  {
    pattern: /\bdisplaced\b|\brefugee\b|\bevacuat/i,
    need: "Displacement Support",
    reason: "Displacement implies shelter and protection needs",
  },
  {
    pattern: /\bearthquake\b|\bseismic\b/i,
    need: "Search & Rescue",
    reason: "Earthquake requires search and rescue capacity",
  },
  {
    pattern: /\bflood(?:ing|ed)?\b/i,
    need: "Flooding",
    reason: "Flooding drives water, shelter, and sanitation needs",
  },
  {
    pattern: /\bconflict\b|\bwar\b|\bshelling\b/i,
    need: "Protection",
    reason: "Conflict elevates protection needs",
  },
];

export const OFFICIAL_SOURCE_PATTERNS = [
  /\bun\b|\bunocha\b|\bunhcr\b|\bunicef\b|\bwfp\b|\bwho\b/i,
  /\breliefweb\b|\bgdacs\b|\bocha\b|\bacled\b/i,
  /\bgovernment\b|\bministry\b|\bofficial\b/i,
];

export const TIMELINE_EVENT_TYPES = {
  INITIAL_REPORT: "initial_report",
  UPDATE: "update",
  ESCALATION: "escalation",
  VERIFICATION: "verification",
  PRIORITY_CHANGE: "priority_change",
  RISK_CHANGE: "risk_change",
  SOURCE_FUSION: "source_fusion",
} as const;
