/** ISO-3166-1 alpha-2 codes considered "Europe" for the purposes of this app. */
export const EUROPE_COUNTRIES: Record<string, string> = {
  AD: "Andorra",
  AL: "Albania",
  AM: "Armenia",
  AT: "Austria",
  AZ: "Azerbaijan",
  BA: "Bosnia and Herzegovina",
  BG: "Bulgaria",
  BY: "Belarus",
  CH: "Switzerland",
  CZ: "Czech Republic",
  DE: "Germany",
  DK: "Denmark",
  EE: "Estonia",
  ES: "Spain",
  FI: "Finland",
  FO: "Faroe Islands",
  FR: "France",
  GB: "United Kingdom",
  GE: "Georgia",
  GR: "Greece",
  HR: "Croatia",
  HU: "Hungary",
  IS: "Iceland",
  IT: "Italy",
  LI: "Liechtenstein",
  LT: "Lithuania",
  LV: "Latvia",
  ME: "Montenegro",
  MK: "North Macedonia",
  NO: "Norway",
  PL: "Poland",
  RO: "Romania",
  RS: "Serbia",
  RU: "Russia",
  SE: "Sweden",
  SI: "Slovenia",
  SK: "Slovakia",
  TR: "Turkey",
  UA: "Ukraine",
};

const NAME_TO_CODE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [code, name] of Object.entries(EUROPE_COUNTRIES)) out[name] = code;
  // Aliases
  out.Czechia = "CZ";
  return out;
})();

export function countryCodeOf(country: string): string | undefined {
  return NAME_TO_CODE[country];
}

export function countryFlag(country: string): string {
  const code = NAME_TO_CODE[country];
  if (!code || code.length !== 2) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + code.charCodeAt(0) - 65, A + code.charCodeAt(1) - 65);
}
