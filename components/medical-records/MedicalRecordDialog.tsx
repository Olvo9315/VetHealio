"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import {
  createMedicalRecord,
  updateMedicalRecord,
} from "@/lib/actions/medicalRecords";
import type { MedicalRecordFull, MedicalRecordFormData } from "@/lib/actions/medicalRecords";
import { searchPetsForAppointment } from "@/lib/actions/appointments";
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
import { Separator } from "@/components/ui/separator";
import { Search, PawPrint, Plus, Trash2, Loader2, Pill } from "lucide-react";

// ---- Schema ----
const prescriptionSchema = z.object({
  medicationName: z.string().min(1, "Requerido"),
  dosage: z.string().min(1, "Requerido"),
  frequency: z.string().min(1, "Requerido"),
  duration: z.string().min(1, "Requerido"),
  notes: z.string().max(200).optional().or(z.literal("")),
});

const schema = z.object({
  petId: z.string().min(1, "Selecciona un paciente"),
  veterinarianId: z.string().min(1, "Selecciona un veterinario"),
  date: z.string().min(1, "Requerido"),
  chiefComplaint: z.string().min(1, "Requerido").max(500),
  diagnosis: z.string().max(500).optional().or(z.literal("")),
  treatment: z.string().max(500).optional().or(z.literal("")),
  weight: z.coerce.number().positive().optional().or(z.literal("")),
  temperature: z.coerce.number().positive().optional().or(z.literal("")),
  heartRate: z.coerce.number().int().positive().optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  prescriptions: z.array(prescriptionSchema).optional(),
});

type FormData = z.infer<typeof schema>;
type PetResult = { id: string; name: string; species: string; owner: { firstName: string; lastName: string; phone: string } };
type Vet = { id: string; name: string; role: string };

interface MedicalRecordDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  record?: MedicalRecordFull;
  presetPetId?: string;
  presetPetName?: string;
  onSaved: (record: MedicalRecordFull) => void;
}

export function MedicalRecordDialog({
  open,
  onOpenChange,
  record,
  presetPetId,
  presetPetName,
  onSaved,
}: MedicalRecordDialogProps) {
  const isEdit = !!record;
  const [isSaving, startSave] = useTransition();
  const [vets, setVets] = useState<Vet[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  // Pet search
  const [petQuery, setPetQuery] = useState("");
  const [petResults, setPetResults] = useState<PetResult[]>([]);
  const [selectedPet, setSelectedPet] = useState<PetResult | null>(null);
  const [isSearching, startSearch] = useTransition();

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: record
      ? {
          petId: record.petId,
          veterinarianId: record.veterinarianId,
          date: format(new Date(record.date), "yyyy-MM-dd'T'HH:mm"),
          chiefComplaint: record.chiefComplaint,
          diagnosis: record.diagnosis ?? "",
          treatment: record.treatment ?? "",
          weight: record.weight ?? "",
          temperature: record.temperature ?? "",
          heartRate: record.heartRate ?? "",
          notes: record.notes ?? "",
          prescriptions: record.prescriptions.map((p) => ({
            medicationName: p.medicationName,
            dosage: p.dosage,
            frequency: p.frequency,
            duration: p.duration,
            notes: p.notes ?? "",
          })),
        }
      : {
          petId: presetPetId ?? "",
          veterinarianId: "",
          date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          chiefComplaint: "",
          diagnosis: "",
          treatment: "",
          weight: "",
          temperature: "",
          heartRate: "",
          notes: "",
          prescriptions: [],
        },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "prescriptions",
  });

  // Load vets
  useEffect(() => {
    getVeterinarians().then(setVets);
  }, []);

  const watchVetId = form.watch("veterinarianId");
  const watchDate = form.watch("date");

  // Re-initialize on open
  useEffect(() => {
    if (!open) return;
    if (isEdit && record) {
      form.reset({
        petId: record.petId,
        veterinarianId: record.veterinarianId,
        date: format(new Date(record.date), "yyyy-MM-dd'T'HH:mm"),
        chiefComplaint: record.chiefComplaint,
        diagnosis: record.diagnosis ?? "",
        treatment: record.treatment ?? "",
        weight: record.weight ?? "",
        temperature: record.temperature ?? "",
        heartRate: record.heartRate ?? "",
        notes: record.notes ?? "",
        prescriptions: record.prescriptions.map((p) => ({
          medicationName: p.medicationName,
          dosage: p.dosage,
          frequency: p.frequency,
          duration: p.duration,
          notes: p.notes ?? "",
        })),
      });
    } else {
      form.reset({
        petId: presetPetId ?? "",
        veterinarianId: vets[0]?.id ?? "",
        date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        chiefComplaint: "",
        diagnosis: "",
        treatment: "",
        weight: "",
        temperature: "",
        heartRate: "",
        notes: "",
        prescriptions: [],
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Set default vet when vets load
  useEffect(() => {
    if (vets.length && !form.getValues("veterinarianId")) {
      form.setValue("veterinarianId", vets[0].id);
    }
  }, [vets, form]);

  // Populate pet on edit
  useEffect(() => {
    if (record) {
      setSelectedPet({
        id: record.petId,
        name: record.pet?.name ?? presetPetName ?? "",
        species: record.pet?.species ?? "",
        owner: record.pet?.owner ?? { firstName: "", lastName: "", phone: "" },
      });
    } else if (presetPetId && presetPetName) {
      setSelectedPet({ id: presetPetId, name: presetPetName, species: "", owner: { firstName: "", lastName: "", phone: "" } });
    }
  }, [record, presetPetId, presetPetName]);

  // Reset on close
  useEffect(() => {
    if (!open && !isEdit) {
      setTimeout(() => {
        form.reset();
        setSelectedPet(presetPetId ? { id: presetPetId, name: presetPetName ?? "", species: "", owner: { firstName: "", lastName: "", phone: "" } } : null);
        setPetQuery("");
        setPetResults([]);
      }, 150);
    }
  }, [open, isEdit, form, presetPetId, presetPetName]);

  // Pet search
  useEffect(() => {
    if (petQuery.length < 2) { setPetResults([]); return; }
    startSearch(async () => {
      const results = await searchPetsForAppointment(petQuery);
      setPetResults(results as PetResult[]);
    });
  }, [petQuery]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleSubmit(data: any) {
    startSave(async () => {
      if (isEdit) {
        const result = await updateMedicalRecord(record.id, data as MedicalRecordFormData);
        if ("error" in result) { toast.error("Error al actualizar"); return; }
        toast.success("Registro actualizado");
        onSaved(result.record);
      } else {
        const result = await createMedicalRecord(data as MedicalRecordFormData);
        if ("error" in result) { toast.error("Error al crear registro"); return; }
        toast.success("Registro creado");
        onSaved(result.record);
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar registro médico" : "Nuevo registro médico"}</DialogTitle>
        </DialogHeader>

        <form
          ref={formRef}
          className="space-y-5 mt-2"
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
          {/* Row: Patient + Vet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Patient search */}
            <div className="space-y-1.5">
              <Label>Paciente *</Label>
              {selectedPet ? (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <PawPrint className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{selectedPet.name}</p>
                      {selectedPet.owner.firstName && (
                        <p className="text-xs text-muted-foreground">
                          {selectedPet.owner.firstName} {selectedPet.owner.lastName}
                        </p>
                      )}
                    </div>
                  </div>
                  {!presetPetId && (
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
                    <div className="border border-border rounded-lg overflow-hidden divide-y divide-border max-h-36 overflow-y-auto">
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
                            <p className="text-xs text-muted-foreground">{p.owner.firstName} {p.owner.lastName}</p>
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

            {/* Date + Vet stacked */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="date">Fecha *</Label>
                <Input
                  id="date"
                  type="datetime-local"
                  value={watchDate ?? ""}
                  onChange={(e) => form.setValue("date", e.target.value, { shouldValidate: true })}
                />
                {form.formState.errors.date && (
                  <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
                )}
              </div>
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
              </div>
            </div>
          </div>

          <Separator />

          {/* Chief complaint */}
          <div className="space-y-1.5">
            <Label htmlFor="chiefComplaint">Motivo de consulta *</Label>
            <Textarea id="chiefComplaint" rows={2} placeholder="Describe el motivo de la visita..." {...form.register("chiefComplaint")} />
            {form.formState.errors.chiefComplaint && (
              <p className="text-xs text-destructive">{form.formState.errors.chiefComplaint.message}</p>
            )}
          </div>

          {/* Diagnosis + Treatment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="diagnosis">Diagnóstico</Label>
              <Textarea id="diagnosis" rows={2} placeholder="Diagnóstico..." {...form.register("diagnosis")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="treatment">Tratamiento</Label>
              <Textarea id="treatment" rows={2} placeholder="Tratamiento indicado..." {...form.register("treatment")} />
            </div>
          </div>

          {/* Vitals */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Constantes vitales</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="weight">Peso (kg)</Label>
                <Input id="weight" type="number" step="0.1" placeholder="0.0" {...form.register("weight")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="temperature">Temp. (°C)</Label>
                <Input id="temperature" type="number" step="0.1" placeholder="38.5" {...form.register("temperature")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="heartRate">FC (lpm)</Label>
                <Input id="heartRate" type="number" placeholder="80" {...form.register("heartRate")} />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas adicionales</Label>
            <Textarea id="notes" rows={2} placeholder="Observaciones..." {...form.register("notes")} />
          </div>

          <Separator />

          {/* Prescriptions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recetas</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => append({ medicationName: "", dosage: "", frequency: "", duration: "", notes: "" })}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Añadir medicamento
              </Button>
            </div>

            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
                Sin recetas
              </p>
            )}

            {fields.map((field, idx) => (
              <div key={field.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Pill className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Medicamento {idx + 1}</span>
                  </div>
                  <button type="button" onClick={() => remove(idx)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Input placeholder="Nombre del medicamento *" {...form.register(`prescriptions.${idx}.medicationName`)} />
                    {form.formState.errors.prescriptions?.[idx]?.medicationName && (
                      <p className="text-xs text-destructive mt-0.5">{form.formState.errors.prescriptions[idx]?.medicationName?.message}</p>
                    )}
                  </div>
                  <Input placeholder="Dosis (ej. 5mg) *" {...form.register(`prescriptions.${idx}.dosage`)} />
                  <Input placeholder="Frecuencia (ej. c/8h) *" {...form.register(`prescriptions.${idx}.frequency`)} />
                  <Input placeholder="Duración (ej. 7 días) *" {...form.register(`prescriptions.${idx}.duration`)} />
                  <Input placeholder="Notas opcionales" {...form.register(`prescriptions.${idx}.notes`)} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-primary text-primary-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Guardar cambios" : "Crear registro"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
