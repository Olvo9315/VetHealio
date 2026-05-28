"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppointmentType, Species } from "@prisma/client";
import {
  createAppointment,
  updateAppointment,
  searchPetsForAppointment,
  createAppointmentWithNewPatient,
} from "@/lib/actions/appointments";
import { findExistingPatients } from "@/lib/actions/patients";
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
import { Search, PawPrint, Loader2, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ---- Schema ----
const schema = z.object({
  title: z.string().min(1, "Requerido"),
  petId: z.string().optional(),
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
type OwnerResult = { id: string; firstName: string; lastName: string; phone: string; email: string | null; pets?: { id: string; name: string; species: string }[] };

type MatchChoice =
  | { type: "new-pet"; ownerId: string; ownerName: string }
  | { type: "existing-pet"; petId: string; pet: PetResult };

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vets: Vet[];
  appointment?: AppointmentFull;
  presetStart?: Date;
  presetPet?: PetResult;
  onSaved: (appointment: AppointmentFull) => void;
}

const SPECIES_LABELS: Record<string, string> = {
  DOG: "🐕 Perro",
  CAT: "🐈 Gato",
  BIRD: "🦜 Pájaro",
  RABBIT: "🐇 Conejo",
  REPTILE: "🦎 Reptil",
  OTHER: "🐾 Otro",
};

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

  // ── Mode toggle ──
  const [mode, setMode] = useState<"existing" | "primary">("existing");

  // ── Existing-patient state ──
  const [petQuery, setPetQuery] = useState("");
  const [petResults, setPetResults] = useState<PetResult[]>([]);
  const [selectedPet, setSelectedPet] = useState<PetResult | null>(presetPet ?? null);
  const [isSearchingPet, startSearchPet] = useTransition();

  // ── Primary-visit state ──
  const [primaryPetName, setPrimaryPetName] = useState("");
  const [primarySpecies, setPrimarySpecies] = useState<Species | "">("");
  const [primaryOwnerFirst, setPrimaryOwnerFirst] = useState("");
  const [primaryOwnerLast, setPrimaryOwnerLast] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [primaryErrors, setPrimaryErrors] = useState<Record<string, string>>({});

  // ── Match detection ──
  const [ownerMatches, setOwnerMatches] = useState<OwnerResult[]>([]);
  const [matchChoice, setMatchChoice] = useState<MatchChoice | null>(null);
  const [showPetList, setShowPetList] = useState(false);
  const [isSearchingOwner, startSearchOwner] = useTransition();
  // Keep latest field values in refs so runMatchSearch always has fresh data
  const petNameRef = useRef("");
  const speciesRef = useRef<Species | "">("");
  const ownerFirstRef = useRef("");
  const ownerLastRef = useRef("");
  const phoneRef = useRef("");

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

  // Re-initialize on open
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
      setMode("existing");
      resetPrimaryFields();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetPrimaryFields() {
    setPrimaryPetName("");
    setPrimarySpecies("");
    setPrimaryOwnerFirst("");
    setPrimaryOwnerLast("");
    setPrimaryPhone("");
    setPrimaryErrors({});
    setOwnerMatches([]);
    setMatchChoice(null);
    setShowPetList(false);
    petNameRef.current = "";
    speciesRef.current = "";
    ownerFirstRef.current = "";
    ownerLastRef.current = "";
    phoneRef.current = "";
  }

  // Pet search (existing mode)
  useEffect(() => {
    if (petQuery.length < 2) { setPetResults([]); return; }
    startSearchPet(async () => {
      const results = await searchPetsForAppointment(petQuery);
      setPetResults(results as PetResult[]);
    });
  }, [petQuery]);

  // Run match search using latest values from all primary fields (AND logic)
  const runMatchSearch = useCallback(() => {
    const petName = petNameRef.current;
    const petSpecies = speciesRef.current;
    const ownerFirst = ownerFirstRef.current;
    const ownerLast = ownerLastRef.current;
    const phone = phoneRef.current;
    const hasTextInput =
      petName.length >= 2 || ownerFirst.length >= 2 || ownerLast.length >= 2 || phone.length >= 2;
    if (!hasTextInput) { setOwnerMatches([]); return; }
    startSearchOwner(async () => {
      const results = await findExistingPatients({ petName, petSpecies, ownerFirst, ownerLast, phone });
      setOwnerMatches(results as OwnerResult[]);
    });
  }, []);

  const handlePetNameChange = useCallback((value: string) => {
    setPrimaryPetName(value);
    petNameRef.current = value;
    setMatchChoice(null);
    setShowPetList(false);
    runMatchSearch();
  }, [runMatchSearch]);

  const handleOwnerFirstChange = useCallback((value: string) => {
    setPrimaryOwnerFirst(value);
    ownerFirstRef.current = value;
    setMatchChoice(null);
    setShowPetList(false);
    runMatchSearch();
  }, [runMatchSearch]);

  const handleOwnerLastChange = useCallback((value: string) => {
    setPrimaryOwnerLast(value);
    ownerLastRef.current = value;
    setMatchChoice(null);
    setShowPetList(false);
    runMatchSearch();
  }, [runMatchSearch]);

  const handleSpeciesChange = useCallback((value: Species | "") => {
    setPrimarySpecies(value);
    speciesRef.current = value;
    setMatchChoice(null);
    setShowPetList(false);
    runMatchSearch();
  }, [runMatchSearch]);

  const handlePhoneChange = useCallback((value: string) => {
    setPrimaryPhone(value);
    phoneRef.current = value;
    setMatchChoice(null);
    setShowPetList(false);
    runMatchSearch();
  }, [runMatchSearch]);

  const watchType = form.watch("type");
  const watchVetId = form.watch("veterinarianId");
  const watchStart = form.watch("startTime");
  const watchEnd = form.watch("endTime");

  // Auto-fill title — existing mode
  useEffect(() => {
    if (mode === "existing" && selectedPet && watchType && !isEdit) {
      form.setValue("title", `${typeConfig[watchType].label} — ${selectedPet.name}`);
    }
  }, [selectedPet, watchType, mode, isEdit, form]);

  // Auto-fill title — primary mode
  useEffect(() => {
    if (mode === "primary" && primaryPetName && watchType && !isEdit) {
      form.setValue("title", `${typeConfig[watchType].label} — ${primaryPetName}`);
    }
  }, [primaryPetName, watchType, mode, isEdit, form]);

  // Auto-set endTime
  useEffect(() => {
    if (watchStart && !isEdit) {
      const start = new Date(watchStart);
      if (!isNaN(start.getTime())) {
        form.setValue("endTime", format(new Date(start.getTime() + 30 * 60000), "yyyy-MM-dd'T'HH:mm"));
      }
    }
  }, [watchStart, isEdit, form]);

  function validatePrimary() {
    const errors: Record<string, string> = {};
    if (!primaryPetName.trim()) errors.petName = "Requerido";
    if (!primarySpecies) errors.petSpecies = "Requerido";
    if (!primaryOwnerFirst.trim()) errors.ownerFirst = "Requerido";
    if (!primaryOwnerLast.trim()) errors.ownerLast = "Requerido";
    if (primaryPhone.trim().length < 7) errors.phone = "Teléfono inválido";
    setPrimaryErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(data: FormData) {
    if (mode === "existing") {
      if (!selectedPet) {
        form.setError("petId", { message: "Selecciona un paciente" });
        return;
      }
      startSave(async () => {
        if (isEdit) {
          const result = await updateAppointment(appointment.id, { ...data, petId: selectedPet.id });
          if ("error" in result) { toast.error("Error al actualizar"); return; }
          toast.success("Cita actualizada");
          onSaved(result.appointment as AppointmentFull);
        } else {
          const result = await createAppointment({ ...data, petId: selectedPet.id });
          if ("error" in result) { toast.error("Error al crear cita"); return; }
          toast.success("Cita creada");
          onSaved(result.appointment as AppointmentFull);
        }
        onOpenChange(false);
      });
    } else {
      if (!validatePrimary()) return;
      startSave(async () => {
        const result = await createAppointmentWithNewPatient(
          { ...data },
          {
            petName: primaryPetName.trim(),
            petSpecies: primarySpecies as Species,
            ownerFirstName: primaryOwnerFirst.trim(),
            ownerLastName: primaryOwnerLast.trim(),
            ownerPhone: primaryPhone.trim(),
            existingOwnerId: matchChoice?.type === "new-pet" ? matchChoice.ownerId : undefined,
            existingPetId: matchChoice?.type === "existing-pet" ? matchChoice.petId : undefined,
          }
        );
        if ("error" in result) { toast.error("Error al crear cita"); return; }
        toast.success("Cita creada");
        onSaved(result.appointment as AppointmentFull);
        onOpenChange(false);
      });
    }
  }

  // When user picks an existing pet from match banner → switch to existing mode
  function applyExistingPetFromMatch(pet: { id: string; name: string; species: string; owner: { firstName: string; lastName: string; phone: string } }) {
    setSelectedPet(pet as PetResult);
    form.setValue("petId", pet.id);
    setMode("existing");
    setOwnerMatches([]);
    setMatchChoice(null);
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
          {/* ── Mode toggle (create only) ── */}
          {!isEdit && (
            <div className="flex rounded-lg border border-border overflow-hidden w-fit">
              {(["existing", "primary"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); resetPrimaryFields(); }}
                  className={cn(
                    "px-4 py-1.5 text-sm transition-colors",
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {m === "existing" ? "Paciente" : "Primario"}
                </button>
              ))}
            </div>
          )}

          {/* ── Existing patient search ── */}
          {mode === "existing" && (
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
                    {isSearchingPet && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
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
          )}

          {/* ── Primary visit fields ── */}
          {mode === "primary" && (
            <div className="space-y-3">
              {/* Pet name + species */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nombre del paciente *</Label>
                  <Input
                    placeholder="Ej: Max"
                    value={primaryPetName}
                    onChange={(e) => handlePetNameChange(e.target.value)}
                  />
                  {primaryErrors.petName && <p className="text-xs text-destructive">{primaryErrors.petName}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Especie *</Label>
                  <Select
                    value={primarySpecies}
                    onValueChange={(v) => handleSpeciesChange(v as Species)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar">
                        {primarySpecies ? SPECIES_LABELS[primarySpecies] : "Seleccionar"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SPECIES_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {primaryErrors.petSpecies && <p className="text-xs text-destructive">{primaryErrors.petSpecies}</p>}
                </div>
              </div>

              {/* Owner name */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Propietario (nombre) *</Label>
                  <Input
                    placeholder="Ej: Alex"
                    value={primaryOwnerFirst}
                    onChange={(e) => handleOwnerFirstChange(e.target.value)}
                  />
                  {primaryErrors.ownerFirst && <p className="text-xs text-destructive">{primaryErrors.ownerFirst}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Apellido *</Label>
                  <Input
                    placeholder="Ej: García"
                    value={primaryOwnerLast}
                    onChange={(e) => handleOwnerLastChange(e.target.value)}
                  />
                  {primaryErrors.ownerLast && <p className="text-xs text-destructive">{primaryErrors.ownerLast}</p>}
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label>Teléfono *</Label>
                <div className="relative">
                  <Input
                    type="tel"
                    placeholder="+34 612 345 678"
                    value={primaryPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                  />
                  {isSearchingOwner && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {primaryErrors.phone && <p className="text-xs text-destructive">{primaryErrors.phone}</p>}
              </div>

              {/* Match banner */}
              {ownerMatches.length > 0 && !matchChoice && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20 p-3 space-y-2">
                  {ownerMatches.slice(0, 1).map((owner) => (
                    <div key={owner.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                          Propietario encontrado: {owner.firstName} {owner.lastName} · {owner.phone}
                        </p>
                      </div>

                      {/* Pet list for "select existing" */}
                      {showPetList && owner.pets && owner.pets.length > 0 && (
                        <div className="mb-2 border border-border rounded-lg overflow-hidden divide-y divide-border">
                          {owner.pets.map((pet) => (
                            <button
                              key={pet.id}
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 text-sm"
                              onClick={() => applyExistingPetFromMatch({
                                id: pet.id,
                                name: pet.name,
                                species: pet.species,
                                owner: { firstName: owner.firstName, lastName: owner.lastName, phone: owner.phone },
                              })}
                            >
                              <PawPrint className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="font-medium">{pet.name}</span>
                              <span className="text-muted-foreground text-xs ml-1">
                                {SPECIES_LABELS[pet.species] ?? pet.species}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                          onClick={() => {
                            setMatchChoice({ type: "new-pet", ownerId: owner.id, ownerName: `${owner.firstName} ${owner.lastName}` });
                            setOwnerMatches([]);
                            setShowPetList(false);
                          }}
                        >
                          Añadir mascota nueva
                        </button>
                        <button
                          type="button"
                          className="text-xs px-2.5 py-1 rounded-md bg-muted text-foreground hover:bg-muted/70 transition-colors"
                          onClick={() => setShowPetList((v) => !v)}
                        >
                          Seleccionar mascota existente
                        </button>
                        <button
                          type="button"
                          className="text-xs px-2.5 py-1 rounded-md bg-background border border-border text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => { setOwnerMatches([]); setShowPetList(false); }}
                        >
                          Ignorar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Match choice pill */}
              {matchChoice && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/40">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-800 dark:text-emerald-300 flex-1">
                    {matchChoice.type === "new-pet"
                      ? `Nueva mascota para ${matchChoice.ownerName}`
                      : `Paciente: ${matchChoice.pet.name}`}
                  </p>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setMatchChoice(null); }}
                  >
                    Cambiar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Type + Veterinarian ── */}
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

          {/* ── Title ── */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input id="title" {...form.register("title")} placeholder="Se genera automáticamente" />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          {/* ── Date/time ── */}
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

          {/* ── Notes ── */}
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
