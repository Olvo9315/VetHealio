"use client";

import { useTransition } from "react";
import { format, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import type { AppointmentFull } from "@/lib/actions/appointments";
import {
  updateAppointmentStatus,
  deleteAppointment,
} from "@/lib/actions/appointments";
import { statusConfig, getTypeCfgForAppointment } from "./AppointmentConfig";
import { AppointmentStatus } from "@prisma/client";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pencil,
  Trash2,
  Clock,
  User,
  PawPrint,
  Phone,
  FileText,
  Loader2,
  Receipt,
  Pill,
} from "lucide-react";
import { cn, formatAppointmentId } from "@/lib/utils";

interface AppointmentDetailSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  appointment: AppointmentFull;
  onUpdated: (apt: AppointmentFull) => void;
  onDeleted: (id: string) => void;
  onEdit: () => void;
  onCreateInvoice?: () => void;
  onCreatePrescription?: () => void;
}

export function AppointmentDetailSheet({
  open,
  onOpenChange,
  appointment,
  onUpdated,
  onDeleted,
  onEdit,
  onCreateInvoice,
  onCreatePrescription,
}: AppointmentDetailSheetProps) {
  const [isUpdating, startUpdate] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const typeCfg = getTypeCfgForAppointment(appointment);
  const stCfg = statusConfig[appointment.status];
  const duration = differenceInMinutes(
    new Date(appointment.endTime),
    new Date(appointment.startTime)
  );

  function handleStatusChange(status: string) {
    if (!status) return;
    startUpdate(async () => {
      await updateAppointmentStatus(appointment.id, status as AppointmentStatus);
      toast.success("Estado actualizado");
      onUpdated({ ...appointment, status: status as AppointmentStatus });
    });
  }

  function handleDelete() {
    if (!confirm(`¿Eliminar cita "${appointment.title}"?`)) return;
    startDelete(async () => {
      await deleteAppointment(appointment.id);
      toast.success("Cita eliminada");
      onDeleted(appointment.id);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: typeCfg.bg }}
            >
              <Clock className="w-5 h-5" style={{ color: typeCfg.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight">{appointment.title}</SheetTitle>
              <p className="text-sm text-muted-foreground capitalize mt-0.5">
                {typeCfg.label}
                <span className="ml-1.5 font-mono text-xs">{formatAppointmentId(appointment.number)}</span>
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-5">
          {/* Date & time */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Fecha y hora
            </p>
            <p className="font-medium text-sm capitalize">
              {format(new Date(appointment.startTime), "EEEE, d MMMM yyyy", { locale: es })}
            </p>
            <p className="text-sm text-muted-foreground">
              {format(new Date(appointment.startTime), "HH:mm")} —{" "}
              {format(new Date(appointment.endTime), "HH:mm")}
              <span className="ml-2 text-xs">({duration} min)</span>
            </p>
          </div>

          <Separator />

          {/* Status */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Estado
            </p>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", stCfg.className)}>
                {stCfg.label}
              </span>
            </div>
            <Select
              value={appointment.status}
              onValueChange={(v) => handleStatusChange(v ?? "")}
            >
              <SelectTrigger className="h-9">
                <SelectValue>
                  {statusConfig[appointment.status]?.label ?? appointment.status}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusConfig).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    {cfg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isUpdating && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Guardando...
              </div>
            )}
          </div>

          <Separator />

          {/* Patient */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Paciente
            </p>
            <div className="flex items-center gap-2">
              <PawPrint className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">{appointment.pet.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                {appointment.pet.owner.firstName} {appointment.pet.owner.lastName}
              </span>
            </div>
            <a
              href={`tel:${appointment.pet.owner.phone}`}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Phone className="w-4 h-4" />
              {appointment.pet.owner.phone}
            </a>
          </div>

          <Separator />

          {/* Veterinarian */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Veterinario
            </p>
            <p className="text-sm font-medium">{appointment.veterinarian.name}</p>
          </div>

          {/* Notes */}
          {appointment.notes && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Notas
                </p>
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground">{appointment.notes}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-border space-y-2">
          {onCreateInvoice && (
            <Button className="w-full" variant="outline" onClick={onCreateInvoice}>
              <Receipt className="w-4 h-4 mr-2" />
              Crear factura
            </Button>
          )}
          {onCreatePrescription && (
            <Button className="w-full" variant="outline" onClick={onCreatePrescription}>
              <Pill className="w-4 h-4 mr-2" />
              Crear receta
            </Button>
          )}
          <Button className="w-full bg-primary text-primary-foreground" onClick={onEdit}>
            <Pencil className="w-4 h-4 mr-2" />
            Editar cita
          </Button>
          <Button
            variant="outline"
            className="w-full text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Eliminar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
