// PRESVET: national register (Ministry of Agriculture, MAPA) of veterinary prescriptions of
// antimicrobials. Since 2 January 2025 vets must also report those for companion animals
// (RD 666/2023), at least every two weeks, to the database of their region, which feeds PRESVET.
// Here: which medicines count, what each line needs before it can be reported.

// Active ingredients that make a prescription reportable (antibacterials used in small animals).
// The vet can always switch the flag by hand.
const ANTIMICROBIALS = [
  "amoxicil", "ampicil", "clavul", "penicil", "bencilpenic", "cloxacil", "cefalex", "cefadrox", "cefazol", "cefovec", "cefpodox", "ceftiofur", "cefquinom",
  "enroflox", "marboflox", "pradoflox", "orbiflox", "ciproflox", "ibaflox", "difloxa", "danoflox",
  "doxicicl", "doxycycl", "oxitetracicl", "tetracicl", "minocicl", "clortetra",
  "metronid", "clindamic", "lincomic", "eritromic", "azitromic", "claritromic", "espiramic", "tilosin", "tylosin",
  "sulfa", "trimetoprim", "gentamic", "neomic", "amikac", "tobramic", "framicet",
  "cloranfen", "florfen", "rifamp", "fusid", "mupiroc", "polimix", "colist", "bacitrac", "fosfomic", "nitrofur",
] as const;

export function isAntibioticIngredient(text: string | null | undefined) {
  const v = (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return !!v && ANTIMICROBIALS.some((a) => v.includes(a));
}

export const PRESVET_ROUTES = ["oral", "topical", "ophthalmic", "otic", "im", "iv", "sc", "intramammary", "other"] as const;
export const PRESVET_PURPOSES = ["THERAPEUTIC", "PROPHYLACTIC", "METAPHYLACTIC"] as const;

export type PresvetItem = {
  antibiotic: boolean;
  nationalCode: string | null;
  activeIngredient: string | null;
  route: string | null;
  treatmentDays: number | null;
  packages: number | null;
  purpose: string | null;
};

// What is still missing for a line to be reported (keys of presvet.field_*)
export function presvetMissing(item: PresvetItem, ctx: { vetLicense: string | null; clinicProvince: string | null; species: string | null }) {
  if (!item.antibiotic) return [];
  const missing: string[] = [];
  if (!item.nationalCode?.trim()) missing.push("nationalCode");
  if (!item.activeIngredient?.trim()) missing.push("activeIngredient");
  if (!item.packages) missing.push("packages");
  if (!item.treatmentDays) missing.push("treatmentDays");
  if (!item.purpose) missing.push("purpose");
  if (!item.route) missing.push("route");
  if (!ctx.species) missing.push("species");
  if (!ctx.vetLicense?.trim()) missing.push("vetLicense");
  if (!ctx.clinicProvince?.trim()) missing.push("clinicProvince");
  return missing;
}
