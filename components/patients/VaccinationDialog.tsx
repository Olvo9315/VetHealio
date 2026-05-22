"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { createVaccination, updateVaccination } from "@/lib/actions/vaccinations";
import type { VaccinationFull } from "@/lib/actions/vaccinations";
import { getVeterinarians } from "@/lib/actions/appointments";
import { toast } from "sonner";
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
import { Loader2 } from "lucide-react";

const schema = z.object({
  petId: z.string().min(1),
  veterinarianId: z.string().min(1, "Selecciona un veterinario"),
  vaccineName: z.string().min(1, "Requerido").max(100),
  dateAdministered: z.string().min(1, "Requerido"),
  nextDueDate: z.string().optional().or(z.literal("")),
  batchNumber: z.string().max(50).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;
type Vet = { id: string; name: string; role: string };

interface VaccinationDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vaccination?: VaccinationFull;
  presetPetId: string;
  presetPetName: string;
  onSaved: (v: VaccinationFull) => void;
}

export function VaccinationDialog({
  open,
  onOpenChange,
  vaccination,
  presetPetId,
  presetPetName,
  onSaved,
}: VaccinationDialogProps) {
  const isEdit = !!vaccination;
  const [isSaving, startSave] = useTransition();
  const [vets, setVets] = useState<Vet[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: vaccination
      ? {
          petId: vaccination.petId,
          veterinarianId: vaccination.veterinarianId,
          vaccineName: vaccination.vaccineName,
          dateAdministered: format(new Date(vaccination.dateAdministered), "yyyy-MM-dd"),
          nextDueDate: vaccination.nextDueDate
            ? format(new Date(vaccination.nextDueDate), "yyyy-MM-dd")
            : "",
          batchNumber: vaccination.batchNumber ?? "",
          notes: vaccination.notes ?? "",
        }
      : {
          petId: presetPetId,
          veterinarianId: "",
          vaccineName: "",
          dateAdministered: format(new Date(), "yyyy-MM-dd"),
          nextDueDate: "",
          batchNumber: "",
          notes: "",
        },
  });

  const watchVetId = form.watch("veterinarianId");

  useEffect(() => {
    getVeterinarians().then(setVets);
  }, []);

  useEffect(() => {
    if (vets.length && !form.getValues("veterinarianId")) {
      form.setValue("veterinarianId", vets[0].id);
    }
  }, [vets, form]);

  useEffect(() => {
    if (open && !isEdit) {
      form.reset({
        petId: presetPetId,
        veterinarianId: vets[0]?.id ?? "",
        vaccineName: "",
        dateAdministered: format(new Date(), "yyyy-MM-dd"),
        nextDueDate: "",
        batchNumber: "",
        notes: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(data: FormData) {
    startSave(async () => {
      if (isEdit) {
        const result = await updateVaccination(vaccination.id, data);
        if ("error" in result) { toast.error("Error al actualizar"); return; }
        toast.success("Vacunación actualizada");
        onSaved(result.vaccination);
      } else {
        const result = await createVaccination(data);
        if ("error" in result) { toast.error("Error al registrar vacunación"); return; }
        toast.success("Vacunación registrada");
        onSaved(result.vaccination);
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar vacunación" : "Registrar vacunación"}</DialogTitle>
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
          {/* Paciente (read-only) */}
          <div className="space-y-1.5">
            <Label>Paciente</Label>
            <div className="px-3 py-2 rounded-lg bg-muted text-sm font-medium">{presetPetName}</div>
          </div>

          {/* Vacuna */}
          <div className="space-y-1.5">
            <Label htmlFor="vaccineName">Nombre de la vacuna *</Label>
            <Input id="vaccineName" placeholder="Ej. Rabia, Parvovirus..." {...form.register("vaccineName")} />
            {form.formState.errors.vaccineName && (
              <p className="text-xs text-destructive">{form.formState.errors.vaccineName.message}</p>
            )}
          </div>

          {/* Veterinario */}
          <div className="space-y-1.5">
            <Label>Veterinario *</Label>
            <Select value={watchVetId} onValueChange={(v) => form.setValue("veterinarianId", v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar">
                  {vets.find((v) => v.id === watchVetId)?.name ?? "Seleccionar"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {vets.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.veterinarianId && (
              <p className="text-xs text-destructive">{form.formState.errors.veterinarianId.message}</p>
            )}
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dateAdministered">Fecha administrada *</Label>
              <Input id="dateAdministered" type="date" {...form.register("dateAdministered")} />
              {form.formState.errors.dateAdministered && (
                <p className="text-xs text-destructive">{form.formState.errors.dateAdministered.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nextDueDate">Próxima dosis</Label>
              <Input id="nextDueDate" type="date" {...form.register("nextDueDate")} />
            </div>
          </div>

          {/* Lote */}
          <div className="space-y-1.5">
            <Label htmlFor="batchNumber">Número de lote</Label>
            <Input id="batchNumber" placeholder="Ej. L12345" {...form.register("batchNumber")} />
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" rows={2} placeholder="Observaciones..." {...form.register("notes")} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-primary text-primary-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Guardar cambios" : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
