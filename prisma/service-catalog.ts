// Default service catalog for a new clinic: names in Spanish (stored), translated in the UI
// through i18nKey ("serviceCatalog" namespace). No prices — each clinic sets its own.
export type CatalogEntry = {
  key: string;
  name: string;
  color?: string;
  children?: CatalogEntry[];
};

const dogWeights = (prefix: string, ranges: [string, string][]): CatalogEntry[] =>
  ranges.map(([suffix, label]) => ({ key: `${prefix}_${suffix}`, name: label }));

export const SERVICE_CATALOG: CatalogEntry[] = [
  {
    key: "bloodTest",
    name: "Analítica de sangre",
    color: "#1D4ED8",
    children: [
      { key: "bloodTest_general", name: "General" },
      { key: "bloodTest_presurgical", name: "Prequirúrgica" },
    ],
  },
  { key: "nailTrim", name: "Cortar uñas", color: "#D97706" },
  {
    key: "spay",
    name: "Esterilización",
    color: "#B91C1C",
    children: [
      { key: "spay_cat", name: "OHT gata" },
      {
        key: "spay_dog",
        name: "OHT perra",
        children: dogWeights("spay_dog", [["0_10", "0 - 10 kg"], ["11_20", "11 - 20 kg"], ["21_30", "21 - 30 kg"]]),
      },
    ],
  },
  {
    key: "neuter",
    name: "Castración",
    color: "#7C3AED",
    children: [
      { key: "neuter_cat", name: "Gato" },
      {
        key: "neuter_dog",
        name: "Perro",
        children: dogWeights("neuter_dog", [["0_10", "0 - 10 kg"], ["11_20", "11 - 20 kg"], ["21_40", "21 - 40 kg"]]),
      },
    ],
  },
  {
    key: "consultation",
    name: "Consulta",
    color: "#15803D",
    children: [
      { key: "consultation_general", name: "General" },
      { key: "consultation_followUp", name: "Seguimiento" },
      { key: "consultation_specialist", name: "Especialista" },
    ],
  },
  {
    key: "ultrasound",
    name: "Ecografía",
    color: "#0F766E",
    children: [
      { key: "ultrasound_clinic", name: "Clínica" },
      { key: "ultrasound_external", name: "Servicio externo" },
    ],
  },
  { key: "urinalysis", name: "Analítica de orina", color: "#6B7280" },
  { key: "dipstickSediment", name: "Tira + sedimento", color: "#0891B2" },
  {
    key: "cytology",
    name: "Citología",
    color: "#BE185D",
    children: [
      { key: "cytology_ear", name: "Auricular" },
      { key: "cytology_skinTumor", name: "Piel / tumor" },
    ],
  },
];
