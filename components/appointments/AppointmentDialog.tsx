"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppointmentType } from "@prisma/client";
import {
  createAppointment,
  updateAppointment,
  searchPetsForAppointment,
} from "@/lib/actions/appointments";
import type { AppointmentFull } from "@/lib/actions/appointments";
import { typeConfig } from "./AppointmentConfig";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, PawPrint, Loader2 } from "lucide-react";

// ---- Schema ----
const schema = z.object({
  title: z.string().min(1, "Requerido"),
  petId: z.string().min(1, "Selecciona un paciente"),
  veterinarianId: z.string().min(1, "Selecciona un veterinario"),
  type: z.nativeEnum(AppointmentType),
  startTime: z.string().min(1, "Requerido"),
  endTime: z.string().min(1, "Requerido"),
  notes: z.string().max(500).optional().or(z.literal("")),
});
type FormData = z.infer<typeof schema>;

// ---- Prop types ----
type Vet = { id: string; name: string; role: string };
type PetResult = { id: string; name: string; species: string; owner: { firstName: string; lastName: string; phone: string } };

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vets: Vet[];
  // When editing
  appointment?: AppointmentFull;
  // Preset date when clicking on a calendar slot
  presetStart?: Date;
  // Preset pet when opening from patient detail
  presetPet?: PetResult;
  onSaved: (appointment: AppointmentFull) => void;
}

export function AppointmentDialog({
  open,
  onOpenChange,
  vets,
  appointment,
  presetStart,
  presetPet,
  onSaved,
}: AppointmentDialogProps) {
  const isEdit = !!appointment;
  const [isSaving, startSave] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Pet search
  const [petQuery, setPetQuery] = useState("");
  const [petResults, setPetResults] = useState<PetResult[]>([]);
  const [selectedPet, setSelectedPet] = useState<PetResult | null>(presetPet ?? null);
  const [isSearching, startSearch] = useTransition();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: appointment
      ? {
          title: appointment.title,
          petId: appointment.petId,
          veterinarianId: appointment.veterinarianId,
          type: appointment.type,
          startTime: format(new Date(appointment.startTime), "yyyy-MM-dd'T'HH:mm"),
          endTime: format(new Date(appointment.endTime), "yyyy-MM-dd'T'HH:mm"),
          notes: appointment.notes ?? "",
        }
      : {
          title: "",
          petId: presetPet?.id ?? "",
          veterinarianId: vets[0]?.id ?? "",
          type: AppointmentType.CONSULTATION,
          startTime: presetStart
            ? format(presetStart, "yyyy-MM-dd'T'HH:mm")
            : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          endTime: presetStart
            ? format(new Date(presetStart.getTime() + 30 * 60000), "yyyy-MM-dd'T'HH:mm")
            : format(new Date(Date.now() + 30 * 60000), "yyyy-MM-dd'T'HH:mm"),
          notes: "",
        },
  });

  // Populate selected pet on edit
  useEffect(() => {
    if (appointment) {
      setSelectedPet({
        id: appointment.petId,
        name: appointment.pet.name,
        species: appointment.pet.species,
        owner: appointment.pet.owner,
      });
    }
  }, [appointment]);

  // Re-initialize on open (so presetStart and current time are always fresh)
  useEffect(() => {
    if (open && !isEdit) {
      const now = new Date();
      form.reset({
        title: "",
        petId: presetPet?.id ?? "",
        veterinarianId: vets[0]?.id ?? "",
        type: AppointmentType.CONSULTATION,
        startTime: presetStart
          ? format(presetStart, "yyyy-MM-dd'T'HH:mm")
          : format(now, "yyyy-MM-dd'T'HH:mm"),
        endTime: presetStart
          ? format(new Date(presetStart.getTime() + 30 * 60000), "yyyy-MM-dd'T'HH:mm")
          : format(new Date(now.getTime() + 30 * 60000), "yyyy-MM-dd'T'HH:mm"),
        notes: "",
      });
      setSelectedPet(presetPet ?? null);
      setPetQuery("");
      setPetResults([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pet search
  useEffect(() => {
    if (petQuery.length < 2) { setPetResults([]); return; }
    startSearch(async () => {
      const results = await searchPetsForAppointment(petQuery);
      setPetResults(results as PetResult[]);
    });
  }, [petQuery]);

  // Watch fields needed for controlled inputs
  const watchType = form.watch("type");
  const watchVetId = form.watch("veterinarianId");
  const watchStart = form.watch("startTime");
  const watchEnd = form.watch("endTime");

  // Auto-fill title when pet + type changes
  useEffect(() => {
    if (selectedPet && watchType && !isEdit) {
      form.setValue("title", `${typeConfig[watchType].label} — ${selectedPet.name}`);
    }
  }, [selectedPet, watchType, isEdit, form]);

  // Auto-set endTime 30 min after startTime
  useEffect(() => {
    if (watchStart && !isEdit) {
      const start = new Date(watchStart);
      if (!isNaN(start.getTime())) {
        form.setValue("endTime", format(new Date(start.getTime() + 30 * 60000), "yyyy-MM-dd'T'HH:mm"));
      }
    }
  }, [watchStart, isEdit, form]);

  async function handleSubmit(data: FormData) {
    startSave(async () => {
      if (isEdit) {
        const result = await updateAppointment(appointment.id, data);
        if ("error" in result) { toast.error("Error al actualizar"); return; }
        toast.success("Cita actualizada");
        onSaved(result.appointment as AppointmentFull);
      } else {
        const result = await createAppointment(data);
        if ("error" in result) { toast.error("Error al crear cita"); return; }
        toast.success("Cita creada");
        onSaved(result.appointment as AppointmentFull);
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cita" : "Nueva cita"}</DialogTitle>
        </DialogHeader>

        <form
          ref={formRef}
          className="space-y-4 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (formRef.current) {
              formRef.current
                .querySelectorAll<HTMLInputElement>("input[name], textarea[name]")
                .forEach((el) => {
                  if (el.value) {
                    form.setValue(el.name as keyof FormData, el.value, { shouldDirty: true });
                  }
                });
            }
            form.handleSubmit(handleSubmit)();
          }}
        >
          {/* Pet search */}
          <div className="space-y-1.5">
            <Label>Paciente *</Label>
            {selectedPet ? (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2">
                  <PawPrint className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{selectedPet.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedPet.owner.firstName} {selectedPet.owner.lastName} · {selectedPet.owner.phone}
                    </p>
                  </div>
                </div>
                {!presetPet && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setSelectedPet(null); form.setValue("petId", ""); }}
                  >
                    Cambiar
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar paciente..."
                    className="pl-9"
                    value={petQuery}
                    onChange={(e) => setPetQuery(e.target.value)}
                  />
                  {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
                {petResults.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden divide-y divide-border max-h-40 overflow-y-auto">
                    {petResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                        onClick={() => {
                          setSelectedPet(p);
                          form.setValue("petId", p.id);
                          setPetQuery("");
                          setPetResults([]);
                        }}
                      >
                        <PawPrint className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.owner.firstName} {p.owner.lastName}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {form.formState.errors.petId && (
                  <p className="text-xs text-destructive">{form.formState.errors.petId.message}</p>
                )}
              </div>
            )}
          </div>

          {/* Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select
                value={watchType}
                onValueChange={(v) => form.setValue("type", (v ?? AppointmentType.CONSULTATION) as AppointmentType)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {watchType ? typeConfig[watchType]?.label : "Seleccionar"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(typeConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Veterinarian */}
            <div className="space-y-1.5">
              <Label>Veterinario *</Label>
              <Select
                value={watchVetId}
                onValueChange={(v) => form.setValue("veterinarianId", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar">
                    {vets.find((v) => v.id === watchVetId)?.name ?? "Seleccionar"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {vets.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name ?? v.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.veterinarianId && (
                <p className="text-xs text-destructive">{form.formState.errors.veterinarianId.message}</p>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input id="title" {...form.register("title")} placeholder="Se genera automáticamente" />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          {/* Date/time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="startTime">Inicio *</Label>
              <Input
                id="startTime"
                type="datetime-local"
                value={watchStart ?? ""}
                onChange={(e) => form.setValue("startTime", e.target.value, { shouldValidate: true })}
              />
              {form.formState.errors.startTime && (
                <p className="text-xs text-destructive">{form.formState.errors.startTime.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endTime">Fin *</Label>
              <Input
                id="endTime"
                type="datetime-local"
                value={watchEnd ?? ""}
                onChange={(e) => form.setValue("endTime", e.target.value, { shouldValidate: true })}
              />
              {form.formState.errors.endTime && (
                <p className="text-xs text-destructive">{form.formState.errors.endTime.message}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Observaciones adicionales..."
              {...form.register("notes")}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-primary text-primary-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Guardar" : "Crear cita"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
