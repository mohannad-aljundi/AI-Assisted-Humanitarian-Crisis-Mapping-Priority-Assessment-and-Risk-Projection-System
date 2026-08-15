import {
  extractCountryName,
  formatCountryWithFlag,
  formatLocationWithFlag,
  getCountryFlagEmoji,
} from "@/lib/countryFlags";

interface CountryFlagProps {
  country?: string | null;
  location?: string | null;
  className?: string;
  title?: string;
}

/** Emoji flag for a country name or location string. */
export function CountryFlag({ country, location, className = "", title }: CountryFlagProps) {
  const source = country ?? location ?? "";
  const emoji = getCountryFlagEmoji(source);
  const resolvedCountry = extractCountryName(source);

  return (
    <span
      className={`country-flag inline-block shrink-0 leading-none ${className}`}
      role="img"
      aria-label={resolvedCountry ? `Flag of ${resolvedCountry}` : "International"}
      title={title ?? (resolvedCountry ? `Flag of ${resolvedCountry}` : undefined)}
    >
      {emoji}
    </span>
  );
}

interface CountryNameProps {
  country: string;
  className?: string;
}

/** Flag emoji followed by the country name. */
export function CountryName({ country, className = "" }: CountryNameProps) {
  const trimmed = country?.trim();
  if (!trimmed || trimmed === "—") {
    return <span className={className}>{trimmed || "—"}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <CountryFlag country={trimmed} />
      <span>{trimmed}</span>
    </span>
  );
}

interface LocationWithFlagProps {
  location: string;
  className?: string;
}

/** Flag emoji before a location line (city, country, or region). */
export function LocationWithFlag({ location, className = "" }: LocationWithFlagProps) {
  const trimmed = location?.trim();
  if (!trimmed) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <CountryFlag location={trimmed} />
      <span>{trimmed}</span>
    </span>
  );
}

export { formatCountryWithFlag, formatLocationWithFlag, getCountryFlagEmoji };
