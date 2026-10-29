// Inventory categories/units are stored as the Spanish strings below (existing data);
// these maps translate them for display. Custom values are shown as typed.
const CATEGORY_KEYS: Record<string, string> = {
  Medicamentos: "medications",
  Vacunas: "vaccines",
  "Material quirúrgico": "surgical",
  Desinfectantes: "disinfectants",
  Alimentación: "food",
  Suplementos: "supplements",
  Equipamiento: "equipment",
  Otros: "others",
};

const UNIT_KEYS: Record<string, string> = {
  unidades: "units",
  comprimidos: "tablets",
  viales: "vials",
  jeringas: "syringes",
  cajas: "boxes",
  bolsas: "bags",
  litros: "liters",
};

type T = (key: string) => string;

export function categoryLabel(t: T, value: string) {
  const key = CATEGORY_KEYS[value];
  return key ? t(`cat_${key}`) : value;
}

export function unitLabel(t: T, value: string) {
  const key = UNIT_KEYS[value];
  return key ? t(`unit_${key}`) : value;
}

export const INVENTORY_CATEGORIES = Object.keys(CATEGORY_KEYS);
export const INVENTORY_UNITS = Object.keys(UNIT_KEYS);
