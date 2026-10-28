"use client";

import { useEffect, useState } from "react";
import { getMedicalRecordForAppointment } from "@/lib/actions/medicalRecords";
import type { MedicalRecordDraft, MedicalRecordFull } from "@/lib/actions/medicalRecords";
import { MedicalRecordDialog } from "./MedicalRecordDialog";

interface VisitMedicalRecordDialogProps {
  appointmentId: string | null;
  onClose: () => void;
  onSaved?: (record: MedicalRecordFull) => void;
  onDeleted?: (id: string) => void;
}

// The medical record of a visit: opens the existing one, or a new one filled in from the visit
export function VisitMedicalRecordDialog({ appointmentId, onClose, onSaved, onDeleted }: VisitMedicalRecordDialogProps) {
  const [loaded, setLoaded] = useState<{ id: string; record?: MedicalRecordFull; draft?: MedicalRecordDraft } | null>(null);

  useEffect(() => {
    if (!appointmentId) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    getMedicalRecordForAppointment(appointmentId).then((res) => {
      if (cancelled) return;
      if (!res) onClose();
      else setLoaded({ id: appointmentId, ...res });
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  if (!loaded || loaded.id !== appointmentId) return null;
  return (
    <MedicalRecordDialog
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      record={loaded.record}
      draft={loaded.draft}
      presetPetId={loaded.record?.petId ?? loaded.draft?.petId}
      presetPetName={loaded.record?.pet.name ?? loaded.draft?.petName}
      onSaved={(r) => onSaved?.(r)}
      onDeleted={onDeleted ? (id) => onDeleted(id) : undefined}
    />
  );
}
