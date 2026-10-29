"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, Loader2, Pill, Plus, ShieldAlert } from "lucide-react";
import { getRecordPrescriptions, type PrescriptionFull } from "@/lib/actions/prescriptions";
import { PrescriptionDialog } from "@/components/patients/PrescriptionDialog";
import { Button } from "@/components/ui/button";
import { formatPrescriptionId } from "@/lib/utils";

// Prescriptions of a medical record: the same prescriptions the visit shows (one list, not a copy).
// Each opens in the prescription form; "Add prescription" writes a new one for this record / visit.
// For a record not saved yet, the new prescriptions are passed up to be linked when it is saved.
export function RecordRxSection({
  petId,
  petName,
  veterinarianId,
  appointmentId,
  medicalRecordId,
  onCreated,
  onChanged,
}: {
  petId: string;
  petName: string;
  veterinarianId?: string;
  appointmentId?: string;
  medicalRecordId?: string;
  onCreated?: (id: string) => void;
  // Something changed (e.g. a new antibiotic) that the caller may want to reflect elsewhere
  onChanged?: () => void;
}) {
  const t = useTranslations("medicalRecords");
  const tp = useTranslations("prescriptions");
  const [list, setList] = useState<PrescriptionFull[] | null>(null);
  const [editing, setEditing] = useState<PrescriptionFull | null>(null);
  const [adding, setAdding] = useState(false);
  const [, startLoad] = useTransition();

  useEffect(() => {
    startLoad(async () => setList(await getRecordPrescriptions({ medicalRecordId, appointmentId })));
  }, [medicalRecordId, appointmentId]);

  function saved(p: PrescriptionFull) {
    setList((prev) => {
      const cur = prev ?? [];
      return cur.some((x) => x.id === p.id) ? cur.map((x) => (x.id === p.id ? p : x)) : [...cur, p];
    });
    onChanged?.();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("prescriptions")}</p>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={!petId} onClick={() => setAdding(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          {t("addPrescription")}
        </Button>
      </div>
      {list === null ? (
        <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">{t("noPrescriptions")}</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {list.map((p) => (
            <button key={p.id} type="button" onClick={() => setEditing(p)} className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/40">
              <Pill className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 text-sm">
                <p className="text-[11px] font-mono text-muted-foreground">{formatPrescriptionId(p.number)}</p>
                {p.items.map((i) => (
                  <p key={i.id} className="truncate">
                    <span className="font-medium">{i.medicationName}</span>
                    {i.units && <span className="text-muted-foreground"> {i.units}</span>}
                    <span className="text-muted-foreground"> — {i.posology}</span>
                  </p>
                ))}
              </div>
              {(p.presvetStatus === "PENDING" || p.presvetStatus === "CHANGED") && (
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-label={tp("presvetPendingShort")} />
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            </button>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <PrescriptionDialog
          open
          onOpenChange={(v) => { if (!v) { setAdding(false); setEditing(null); } }}
          petId={petId}
          petName={petName}
          veterinarianId={veterinarianId}
          appointmentId={appointmentId}
          medicalRecordId={medicalRecordId}
          record={editing ?? undefined}
          onSaved={(p) => {
            if (!editing) onCreated?.(p.id);
            saved(p);
            setAdding(false);
            setEditing(null);
          }}
          onDeleted={(id) => {
            setList((prev) => prev?.filter((x) => x.id !== id) ?? prev);
            setEditing(null);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
