import { COUNTRY_CENTROIDS } from "@/lib/countryCentroids";

export interface GeographicEntity {
  key: string;
  label: string;
  country: string;
  city: string | null;
  region: string | null;
  aliases: string[];
  type: "country" | "city" | "region";
}

function entity(
  key: string,
  label: string,
  country: string,
  aliases: string[],
  city: string | null = null,
  region: string | null = null,
  type: GeographicEntity["type"] = "country"
): GeographicEntity {
  return { key, label, country, city, region, aliases, type };
}

const CITY_ENTITIES: GeographicEntity[] = [
  entity("gaza", "Gaza", "Palestine", ["gaza", "gaza strip"], "Gaza", "Gaza Strip", "city"),
  entity("khartoum", "Khartoum", "Sudan", ["khartoum"], "Khartoum", null, "city"),
  entity("port-au-prince", "Port-au-Prince", "Haiti", ["port-au-prince", "port au prince"], "Port-au-Prince", null, "city"),
  entity("artibonite", "Artibonite", "Haiti", ["artibonite"], "Artibonite", "Artibonite", "region"),
  entity("beirut", "Beirut", "Lebanon", ["beirut"], "Beirut", null, "city"),
  entity("aleppo", "Aleppo", "Syria", ["aleppo"], "Aleppo", null, "city"),
  entity("kyiv", "Kyiv", "Ukraine", ["kyiv", "kiev"], "Kyiv", null, "city"),
  entity("kinshasa", "Kinshasa", "Democratic Republic of the Congo", ["kinshasa"], "Kinshasa", null, "city"),
  entity("goma", "Goma", "Democratic Republic of the Congo", ["goma"], "Goma", null, "city"),
];

const COUNTRY_ENTITIES: GeographicEntity[] = Object.values(COUNTRY_CENTROIDS).map(
  (centroid) =>
    entity(
      centroid.name.toLowerCase(),
      centroid.name,
      centroid.name,
      [centroid.name.toLowerCase()],
      null,
      null,
      "country"
    )
);

const EXTRA_COUNTRY_ENTITIES: GeographicEntity[] = [
  entity("lebanon", "Lebanon", "Lebanon", ["lebanon", "lebanese"]),
  entity(
    "democratic republic of the congo",
    "Democratic Republic of the Congo",
    "Democratic Republic of the Congo",
    [
      "democratic republic of the congo",
      "dr congo",
      "drc",
      "congo-kinshasa",
      "congo (drc)",
    ]
  ),
  entity("republic of the congo", "Republic of the Congo", "Republic of the Congo", [
    "republic of the congo",
    "congo-brazzaville",
  ]),
  entity("venezuela", "Venezuela", "Venezuela", ["venezuela", "venezuelan"]),
  entity("nigeria", "Nigeria", "Nigeria", ["nigeria", "nigerian"]),
  entity("kenya", "Kenya", "Kenya", ["kenya", "kenyan"]),
  entity("jordan", "Jordan", "Jordan", ["jordan", "jordanian"]),
  entity("israel", "Israel", "Israel", ["israel", "israeli"]),
  entity("iran", "Iran", "Iran", ["iran", "iranian"]),
  entity("india", "India", "India", ["india", "indian"]),
  entity("philippines", "Philippines", "Philippines", ["philippines", "filipino"]),
  entity("indonesia", "Indonesia", "Indonesia", ["indonesia", "indonesian"]),
  entity("mozambique", "Mozambique", "Mozambique", ["mozambique"]),
  entity("chad", "Chad", "Chad", ["chad", "chadian"]),
  entity("south sudan", "South Sudan", "South Sudan", ["south sudan"]),
  entity("central african republic", "Central African Republic", "Central African Republic", [
    "central african republic",
    "car",
  ]),
  entity("mali", "Mali", "Mali", ["mali", "malian"]),
  entity("niger", "Niger", "Niger", ["niger", "nigerien"]),
  entity("burkina faso", "Burkina Faso", "Burkina Faso", ["burkina faso"]),
  entity("myanmar", "Myanmar", "Myanmar", ["myanmar", "burma"]),
  entity("pakistan", "Pakistan", "Pakistan", ["pakistan", "pakistani"]),
  entity("bangladesh", "Bangladesh", "Bangladesh", ["bangladesh", "bangladeshi"]),
  entity("ethiopia", "Ethiopia", "Ethiopia", ["ethiopia", "ethiopian"]),
  entity("libya", "Libya", "Libya", ["libya", "libyan"]),
  entity("türkiye", "Türkiye", "Türkiye", ["türkiye", "turkey", "turkish"]),
];

export const GEOGRAPHIC_ENTITIES: GeographicEntity[] = [
  ...CITY_ENTITIES,
  ...EXTRA_COUNTRY_ENTITIES,
  ...COUNTRY_ENTITIES,
].sort((a, b) => {
  const aMax = Math.max(...a.aliases.map((alias) => alias.length));
  const bMax = Math.max(...b.aliases.map((alias) => alias.length));
  return bMax - aMax;
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findGeographicMentions(text: string): GeographicEntity[] {
  const normalised = text.toLowerCase();
  const found = new Map<string, GeographicEntity>();

  for (const geo of GEOGRAPHIC_ENTITIES) {
    for (const alias of geo.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
      if (pattern.test(normalised)) {
        if (!found.has(geo.key)) {
          found.set(geo.key, geo);
        }
        break;
      }
    }
  }

  return [...found.values()];
}

export function uniqueCountries(entities: GeographicEntity[]): string[] {
  const countries = new Set<string>();
  for (const entity of entities) {
    countries.add(entity.country);
  }
  return [...countries];
}
