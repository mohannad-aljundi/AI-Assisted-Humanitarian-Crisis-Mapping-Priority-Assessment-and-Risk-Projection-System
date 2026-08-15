/** Approximate geographic centroids for humanitarian crisis countries (WGS84). */
export const COUNTRY_CENTROIDS: Record<
  string,
  { lat: number; lng: number; name: string }
> = {
  afghanistan: { lat: 33.94, lng: 67.71, name: "Afghanistan" },
  ethiopia: { lat: 9.15, lng: 40.49, name: "Ethiopia" },
  haiti: { lat: 18.97, lng: -72.29, name: "Haiti" },
  iraq: { lat: 33.22, lng: 43.68, name: "Iraq" },
  lebanon: { lat: 33.85, lng: 35.86, name: "Lebanon" },
  libya: { lat: 26.34, lng: 17.23, name: "Libya" },
  mali: { lat: 17.57, lng: -3.99, name: "Mali" },
  myanmar: { lat: 21.91, lng: 95.96, name: "Myanmar" },
  niger: { lat: 17.61, lng: 8.08, name: "Niger" },
  palestine: { lat: 31.95, lng: 35.23, name: "Palestine" },
  somalia: { lat: 5.15, lng: 46.2, name: "Somalia" },
  sudan: { lat: 15.5, lng: 32.53, name: "Sudan" },
  syria: { lat: 34.8, lng: 38.99, name: "Syria" },
  ukraine: { lat: 48.38, lng: 31.17, name: "Ukraine" },
  yemen: { lat: 15.55, lng: 48.52, name: "Yemen" },
  congo: { lat: -4.04, lng: 21.76, name: "Democratic Republic of the Congo" },
  "democratic republic of the congo": {
    lat: -4.04,
    lng: 21.76,
    name: "Democratic Republic of the Congo",
  },
  bangladesh: { lat: 23.68, lng: 90.36, name: "Bangladesh" },
  pakistan: { lat: 30.38, lng: 69.35, name: "Pakistan" },
  turkey: { lat: 38.96, lng: 35.24, name: "Türkiye" },
  turkiye: { lat: 38.96, lng: 35.24, name: "Türkiye" },
  venezuela: { lat: 6.42, lng: -66.59, name: "Venezuela" },
  gaza: { lat: 31.5, lng: 34.47, name: "Gaza" },
  "gaza strip": { lat: 31.5, lng: 34.47, name: "Gaza Strip" },
};

export function resolveCountryCentroid(
  text: string
): { lat: number; lng: number; name: string } | null {
  const key = text.trim().toLowerCase();
  if (!key) return null;

  if (COUNTRY_CENTROIDS[key]) return COUNTRY_CENTROIDS[key];

  for (const [countryKey, centroid] of Object.entries(COUNTRY_CENTROIDS)) {
    if (key.includes(countryKey) || countryKey.includes(key)) {
      return centroid;
    }
  }

  return null;
}

export function resolveCountryCentroidFromTexts(
  texts: string[]
): { lat: number; lng: number; name: string } | null {
  for (const text of texts) {
    const match = resolveCountryCentroid(text);
    if (match) return match;
  }
  return null;
}
