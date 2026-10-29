// Chronic conditions / patient groups. Stored as these keys (translated in patients.conditions.*)
// or as free text for anything else. Used to flag the patient and, later, to filter reminders.
export const PET_CONDITIONS = [
  "allergy",
  "atopy",
  "arthrosis",
  "cardiac",
  "renal",
  "diabetes",
  "hypothyroidism",
  "epilepsy",
  "leishmaniasis",
  "periodontal",
  "obesity",
  "geriatric",
] as const;

export function isConditionKey(key: string): key is (typeof PET_CONDITIONS)[number] {
  return (PET_CONDITIONS as readonly string[]).includes(key);
}

export function conditionLabel(t: (key: string) => string, key: string) {
  return isConditionKey(key) ? t(`conditions.${key}`) : key;
}
