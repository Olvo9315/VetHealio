import { Pill } from "lucide-react";

export type RecordPrescription = {
  id: string;
  // Medication typed inside the record (older records)
  medicationName: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  // Prescription written with the prescription form (e.g. in the visit)
  items?: { id: string; medicationName: string; units: string | null; posology: string }[];
};

// One line per medication of a record, whichever way it was prescribed
export function RecordPrescriptions({ prescriptions }: { prescriptions: RecordPrescription[] }) {
  const lines = prescriptions.flatMap((p) =>
    p.items?.length
      ? p.items.map((i) => ({ key: i.id, name: `${i.medicationName}${i.units ? ` ${i.units}` : ""}`, detail: i.posology }))
      : p.medicationName
        ? [{ key: p.id, name: p.medicationName, detail: [p.dosage, p.frequency, p.duration].filter(Boolean).join(" · ") }]
        : []
  );
  return (
    <div className="space-y-1">
      {lines.map((l) => (
        <div key={l.key} className="flex items-start gap-1.5 text-xs bg-primary/5 rounded px-2 py-1.5">
          <Pill className="w-3 h-3 text-primary shrink-0 mt-0.5" />
          <span>
            <span className="font-medium">{l.name}</span>
            {l.detail && <> — {l.detail}</>}
          </span>
        </div>
      ))}
    </div>
  );
}
