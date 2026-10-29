// Kinds of signed documents. "rgpd" is data protection; the rest are informed consents for veterinary
// acts. The Spanish veterinary code of ethics (Código Deontológico, art. 18) requires express written
// consent, after informing the owner, before acts that carry a risk for the animal (surgery, sedation or
// anaesthesia, hospitalisation, risky treatments) and before euthanasia or necropsy.
export const TREATMENT_CONSENTS = ["general", "surgery", "hospitalization", "euthanasia", "necropsy"] as const;
export type TreatmentConsentKind = (typeof TREATMENT_CONSENTS)[number];
export type ConsentKind = "rgpd" | TreatmentConsentKind;

export function isTreatmentKind(kind: string): kind is TreatmentConsentKind {
  return (TREATMENT_CONSENTS as readonly string[]).includes(kind);
}

// What each kind asks the vet to fill in before the owner signs
export const CONSENT_FIELDS: Record<TreatmentConsentKind, ("procedure" | "risks" | "alternatives" | "cost" | "bodyDestination")[]> = {
  general: ["procedure", "cost"],
  surgery: ["procedure", "risks", "alternatives", "cost"],
  hospitalization: ["procedure", "risks", "cost"],
  euthanasia: ["procedure", "bodyDestination", "cost"],
  necropsy: ["procedure", "bodyDestination", "cost"],
};

export type ConsentDetails = {
  procedure?: string;
  risks?: string;
  alternatives?: string;
  cost?: string;
  bodyDestination?: "home" | "individual" | "collective" | "";
  vetName?: string;
  vetLicense?: string;
};
