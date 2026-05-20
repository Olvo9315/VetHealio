import { format } from "date-fns";
import { FileText, Thermometer, Heart, Weight } from "lucide-react";

interface MedicalRecord {
  id: string;
  date: Date;
  chiefComplaint: string;
  diagnosis: string | null;
  treatment: string | null;
  weight: number | null;
  temperature: number | null;
  heartRate: number | null;
  notes: string | null;
  createdAt: Date;
  veterinarian: { name: string };
  prescriptions: Array<{
    id: string;
    medicationName: string;
    dosage: string;
    frequency: string;
    duration: string;
  }>;
}

interface MedicalTimelineProps {
  records: MedicalRecord[];
}

export function MedicalTimeline({ records }: MedicalTimelineProps) {
  if (records.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Sin registros médicos</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Timeline line */}
      <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-border" />

      {records.map((record) => (
        <div key={record.id} className="relative flex gap-4 pb-6">
          {/* Dot */}
          <div className="relative z-10 w-8 h-8 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center shrink-0 mt-1">
            <FileText className="w-3.5 h-3.5 text-primary" />
          </div>

          {/* Card */}
          <div className="flex-1 bg-card border border-border rounded-lg p-4 space-y-3 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{record.chiefComplaint}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(record.date), "dd MMM yyyy")} · Dr. {record.veterinarian.name}
                </p>
              </div>
            </div>

            {/* Vitals */}
            {(record.weight || record.temperature || record.heartRate) && (
              <div className="flex flex-wrap gap-3">
                {record.weight && (
                  <span className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full">
                    <Weight className="w-3 h-3" />
                    {record.weight} kg
                  </span>
                )}
                {record.temperature && (
                  <span className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full">
                    <Thermometer className="w-3 h-3" />
                    {record.temperature}°C
                  </span>
                )}
                {record.heartRate && (
                  <span className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full">
                    <Heart className="w-3 h-3" />
                    {record.heartRate} lpm
                  </span>
                )}
              </div>
            )}

            {/* Diagnosis & treatment */}
            {record.diagnosis && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  Diagnóstico
                </p>
                <p className="text-sm">{record.diagnosis}</p>
              </div>
            )}
            {record.treatment && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  Tratamiento
                </p>
                <p className="text-sm">{record.treatment}</p>
              </div>
            )}

            {/* Prescriptions */}
            {record.prescriptions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Recetas
                </p>
                <div className="space-y-1">
                  {record.prescriptions.map((p) => (
                    <div key={p.id} className="text-xs bg-primary/5 rounded px-2 py-1.5">
                      <span className="font-medium">{p.medicationName}</span>
                      {" — "}
                      {p.dosage} · {p.frequency} · {p.duration}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {record.notes && (
              <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-1">
                {record.notes}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
