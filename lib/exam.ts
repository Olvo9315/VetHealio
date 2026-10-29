// Physical exam of a medical record: a short checklist the vet marks as normal / abnormal with a note.
// The clinic can replace the list in Settings (ClinicSettings.examTemplate); a row there is either
// one of these keys or a custom label.

export const DEFAULT_EXAM_KEYS = [
  "general",
  "bodyCondition",
  "mucous",
  "hydration",
  "lymphNodes",
  "heart",
  "lungs",
  "abdomen",
  "skin",
  "eyes",
  "ears",
  "mouth",
  "musculoskeletal",
  "neuro",
] as const;

export type ExamStatus = "normal" | "abnormal" | null;
export type ExamRow = { key: string; status: ExamStatus; note: string };

export function isExamKey(key: string): key is (typeof DEFAULT_EXAM_KEYS)[number] {
  return (DEFAULT_EXAM_KEYS as readonly string[]).includes(key);
}

// Label of a row: translated for built-in keys, the custom text otherwise
export function examLabel(t: (key: string) => string, key: string) {
  return isExamKey(key) ? t(`exam.${key}`) : key;
}

export function templateKeys(template: unknown): string[] {
  return Array.isArray(template) && template.every((k) => typeof k === "string") && template.length
    ? (template as string[])
    : [...DEFAULT_EXAM_KEYS];
}

// Rows for the form: saved values first, then template rows not filled in yet
export function examRows(saved: unknown, template: string[]): ExamRow[] {
  const rows = parseExam(saved);
  const have = new Set(rows.map((r) => r.key));
  return [...rows, ...template.filter((k) => !have.has(k)).map((key) => ({ key, status: null, note: "" }))];
}

export function parseExam(value: unknown): ExamRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as { key?: unknown }).key === "string")
    .map((r) => ({
      key: r.key as string,
      status: r.status === "normal" || r.status === "abnormal" ? r.status : null,
      note: typeof r.note === "string" ? r.note : "",
    }));
}

// Only rows the vet actually filled in are stored
export function filledExam(rows: ExamRow[]) {
  return rows.filter((r) => r.status || r.note.trim());
}
