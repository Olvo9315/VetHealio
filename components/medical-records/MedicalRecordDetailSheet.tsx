"use client";

import { useTransition } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { MedicalRecordFull } from "@/lib/actions/medicalRecords";
import { deleteMedicalRecord } from "@/lib/actions/medicalRecords";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Pencil,
  Trash2,
  Loader2,
  PawPrint,
  User,
  Phone,
  Stethoscope,
  Pill,
  Thermometer,
  Heart,
  Weight,
  FileText,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SpeciesBadge } from "@/components/patients/SpeciesBadge";

interface MedicalRecordDetailSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  record: MedicalRecordFull;
  onDeleted: (id: string) => void;
  onEdit: () => void;
}

export function MedicalRecordDetailSheet({
  open,
  onOpenChange,
  record,
  onDeleted,
  onEdit,
}: MedicalRecordDetailSheetProps) {
  const [isDeleting, startDelete] = useTransition();

  function handleDelete() {
    if (!confirm(`¿Eliminar este registro médico?`)) return;
    startDelete(async () => {
      await deleteMedicalRecord(record.id);
      toast.success("Registro eliminado");
      onDeleted(record.id);
    });
  }

  const hasVitals = record.weight !== null || record.temperature !== null || record.heartRate !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Stethoscope className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight">Registro médico</SheetTitle>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground capitalize">
                  {format(new Date(record.date), "EEEE, d MMMM yyyy · HH:mm", { locale: es })}
                </p>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-5">
          {/* Patient */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Paciente</p>
            <div className="flex items-center gap-2">
              <PawPrint className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm">{record.pet.name}</span>
              <SpeciesBadge species={record.pet.species} size="sm" />
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm">{record.pet.owner.firstName} {record.pet.owner.lastName}</span>
            </div>
            <a
              href={`tel:${record.pet.owner.phone}`}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Phone className="w-4 h-4 shrink-0" />
              {record.pet.owner.phone}
            </a>
          </div>

          <Separator />

          {/* Veterinarian */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Veterinario</p>
            <p className="text-sm font-medium">{record.veterinarian.name}</p>
          </div>

          <Separator />

          {/* Chief Complaint */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Motivo de consulta</p>
            <p className="text-sm">{record.chiefComplaint}</p>
          </div>

          {/* Diagnosis */}
          {record.diagnosis && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Diagnóstico</p>
                <p className="text-sm">{record.diagnosis}</p>
              </div>
            </>
          )}

          {/* Treatment */}
          {record.treatment && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tratamiento</p>
                <p className="text-sm">{record.treatment}</p>
              </div>
            </>
          )}

          {/* Vitals */}
          {hasVitals && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Constantes vitales</p>
                <div className="flex flex-wrap gap-2">
                  {record.weight !== null && (
                    <VitalBadge icon={<Weight className="w-3.5 h-3.5" />} label="Peso" value={`${record.weight} kg`} color="blue" />
                  )}
                  {record.temperature !== null && (
                    <VitalBadge icon={<Thermometer className="w-3.5 h-3.5" />} label="Temp." value={`${record.temperature} °C`} color="amber" />
                  )}
                  {record.heartRate !== null && (
                    <VitalBadge icon={<Heart className="w-3.5 h-3.5" />} label="FC" value={`${record.heartRate} lpm`} color="red" />
                  )}
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          {record.notes && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notas</p>
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-sm">{record.notes}</p>
                </div>
              </div>
            </>
          )}

          {/* Prescriptions */}
          {record.prescriptions.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Recetas ({record.prescriptions.length})
                </p>
                <div className="space-y-2">
                  {record.prescriptions.map((p) => (
                    <div key={p.id} className="border border-border rounded-lg p-3 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Pill className="w-3.5 h-3.5 text-primary" />
                        <span className="text-sm font-medium">{p.medicationName}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                        <span><span className="font-medium text-foreground">Dosis:</span> {p.dosage}</span>
                        <span><span className="font-medium text-foreground">Frec.:</span> {p.frequency}</span>
                        <span><span className="font-medium text-foreground">Dur.:</span> {p.duration}</span>
                      </div>
                      {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-border space-y-2">
          <Button className="w-full bg-primary text-primary-foreground" onClick={onEdit}>
            <Pencil className="w-4 h-4 mr-2" />
            Editar registro
          </Button>
          <Button
            variant="outline"
            className="w-full text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Eliminar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VitalBadge({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "blue" | "amber" | "red";
}) {
  const colorMap = {
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    red: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };
  return (
    <div className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium", colorMap[color])}>
      {icon}
      <span className="opacity-70">{label}</span>
      <span>{value}</span>
    </div>
  );
}
