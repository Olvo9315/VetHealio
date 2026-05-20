"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Species, Gender } from "@prisma/client";
import { searchOwners, createOwner, createPet } from "@/lib/actions/patients";
import type { PetWithOwner } from "@/lib/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, Loader2, User, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ---- Schemas ----
const ownerFormSchema = z.object({
  firstName: z.string().min(1, "Requerido"),
  lastName: z.string().min(1, "Requerido"),
  phone: z.string().min(7, "Teléfono inválido"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  address: z.string().optional(),
});

const petFormSchema = z.object({
  name: z.string().min(1, "Requerido"),
  species: z.nativeEnum(Species),
  breed: z.string().optional(),
  color: z.string().optional(),
  birthDate: z.string().optional(),
  weight: z.string().optional(),
  gender: z.nativeEnum(Gender).optional().or(z.literal("" as const)),
  microchipNumber: z.string().optional(),
});

type OwnerForm = z.infer<typeof ownerFormSchema>;
type PetForm = z.infer<typeof petFormSchema>;

// ---- Owner search result type ----
type OwnerResult = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
};

interface NewPatientDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (pet: PetWithOwner) => void;
}

type Step = "owner" | "pet";
type OwnerMode = "search" | "create";

export function NewPatientDialog({ open, onOpenChange, onCreated }: NewPatientDialogProps) {
  const t = useTranslations("patients");
  const tCommon = useTranslations("common");

  const [step, setStep] = useState<Step>("owner");
  const [, setOwnerMode] = useState<OwnerMode>("search");
  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerResults, setOwnerResults] = useState<OwnerResult[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<OwnerResult | null>(null);
  const [showOwnerForm, setShowOwnerForm] = useState(false);
  const [isSearching, startSearch] = useTransition();
  const [isSaving, startSave] = useTransition();

  const ownerForm = useForm<OwnerForm>({ resolver: zodResolver(ownerFormSchema) });
  const petForm = useForm<PetForm>({ resolver: zodResolver(petFormSchema) });

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("owner");
        setOwnerMode("search");
        setOwnerQuery("");
        setOwnerResults([]);
        setSelectedOwner(null);
        setShowOwnerForm(false);
        ownerForm.reset();
        petForm.reset();
      }, 200);
    }
  }, [open, ownerForm, petForm]);

  // Search owners
  useEffect(() => {
    if (ownerQuery.length < 2) {
      setOwnerResults([]);
      return;
    }
    startSearch(async () => {
      const results = await searchOwners(ownerQuery);
      setOwnerResults(results as OwnerResult[]);
    });
  }, [ownerQuery]);

  async function handleCreateOwner(data: OwnerForm) {
    startSave(async () => {
      const result = await createOwner(data);
      if ("error" in result) {
        toast.error("Error al crear propietario");
        return;
      }
      setSelectedOwner(result.owner as OwnerResult);
      setShowOwnerForm(false);
      setStep("pet");
    });
  }

  async function handleCreatePet(data: PetForm) {
    if (!selectedOwner) return;
    startSave(async () => {
      const result = await createPet({
        ...data,
        ownerId: selectedOwner.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        weight: (data.weight || "") as any,
        gender: data.gender || "",
      });
      if ("error" in result) {
        toast.error("Error al crear paciente");
        return;
      }
      toast.success(`${result.pet.name} fue añadido correctamente`);
      onCreated(result.pet as PetWithOwner);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "owner" ? "Propietario" : t("newPatient")}
          </DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-2">
            {(["owner", "pet"] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                    step === s
                      ? "bg-primary text-primary-foreground"
                      : selectedOwner && s === "owner"
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {i + 1}
                </div>
                <span className={cn("text-sm", step === s ? "font-medium" : "text-muted-foreground")}>
                  {s === "owner" ? "Propietario" : "Paciente"}
                </span>
                {i < 1 && <div className="w-8 h-px bg-border" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        {/* ── STEP 1: Owner ── */}
        {step === "owner" && (
          <div className="space-y-4 mt-2">
            {/* Search existing owner */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Buscar propietario existente</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Nombre, teléfono o email..."
                  className="pl-9"
                  value={ownerQuery}
                  onChange={(e) => setOwnerQuery(e.target.value)}
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Results */}
              {ownerResults.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                  {ownerResults.map((owner) => (
                    <button
                      key={owner.id}
                      type="button"
                      className={cn(
                        "w-full flex items-center gap-3 p-2.5 text-left hover:bg-muted/50 transition-colors",
                        selectedOwner?.id === owner.id && "bg-primary/10"
                      )}
                      onClick={() => {
                        setSelectedOwner(owner);
                        setOwnerResults([]);
                        setOwnerQuery("");
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {owner.firstName} {owner.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {owner.phone}
                          {owner.email ? ` · ${owner.email}` : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected owner pill */}
              {selectedOwner && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {selectedOwner.firstName} {selectedOwner.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">{selectedOwner.phone}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedOwner(null)}
                  >
                    Cambiar
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground px-2">o</span>
              <Separator className="flex-1" />
            </div>

            {/* Create new owner toggle */}
            <button
              type="button"
              className="w-full flex items-center justify-between text-sm font-medium text-primary hover:underline"
              onClick={() => setShowOwnerForm((v) => !v)}
            >
              <span className="flex items-center gap-1">
                <Plus className="w-4 h-4" />
                Crear nuevo propietario
              </span>
              {showOwnerForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showOwnerForm && (
              <form onSubmit={ownerForm.handleSubmit(handleCreateOwner)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="firstName">Nombre *</Label>
                    <Input id="firstName" {...ownerForm.register("firstName")} />
                    {ownerForm.formState.errors.firstName && (
                      <p className="text-xs text-destructive">{ownerForm.formState.errors.firstName.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lastName">Apellido *</Label>
                    <Input id="lastName" {...ownerForm.register("lastName")} />
                    {ownerForm.formState.errors.lastName && (
                      <p className="text-xs text-destructive">{ownerForm.formState.errors.lastName.message}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone">Teléfono *</Label>
                  <Input id="phone" type="tel" {...ownerForm.register("phone")} />
                  {ownerForm.formState.errors.phone && (
                    <p className="text-xs text-destructive">{ownerForm.formState.errors.phone.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...ownerForm.register("email")} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="address">Dirección</Label>
                  <Input id="address" {...ownerForm.register("address")} />
                </div>
                <Button type="submit" className="w-full" disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Crear propietario y continuar
                </Button>
              </form>
            )}

            {/* Continue with selected owner */}
            {selectedOwner && !showOwnerForm && (
              <Button className="w-full bg-primary text-primary-foreground" onClick={() => setStep("pet")}>
                Continuar con {selectedOwner.firstName}
              </Button>
            )}
          </div>
        )}

        {/* ── STEP 2: Pet ── */}
        {step === "pet" && (
          <form onSubmit={petForm.handleSubmit(handleCreatePet)} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              {/* Name */}
              <div className="col-span-2 space-y-1">
                <Label htmlFor="petName">{t("name")} *</Label>
                <Input id="petName" placeholder="Ej: Max" {...petForm.register("name")} />
                {petForm.formState.errors.name && (
                  <p className="text-xs text-destructive">{petForm.formState.errors.name.message}</p>
                )}
              </div>

              {/* Species */}
              <div className="space-y-1">
                <Label>{t("species")} *</Label>
                <Select
                  onValueChange={(v) => petForm.setValue("species", (v ?? "") as Species)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOG">🐕 {t("dog")}</SelectItem>
                    <SelectItem value="CAT">🐈 {t("cat")}</SelectItem>
                    <SelectItem value="BIRD">🦜 {t("bird")}</SelectItem>
                    <SelectItem value="RABBIT">🐇 {t("rabbit")}</SelectItem>
                    <SelectItem value="REPTILE">🦎 {t("reptile")}</SelectItem>
                    <SelectItem value="OTHER">🐾 {t("other")}</SelectItem>
                  </SelectContent>
                </Select>
                {petForm.formState.errors.species && (
                  <p className="text-xs text-destructive">{petForm.formState.errors.species.message}</p>
                )}
              </div>

              {/* Gender */}
              <div className="space-y-1">
                <Label>{t("gender") ?? "Sexo"}</Label>
                <Select onValueChange={(v) => petForm.setValue("gender", (v ?? "") as Gender | "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">♂ {t("male")}</SelectItem>
                    <SelectItem value="FEMALE">♀ {t("female")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Breed */}
              <div className="space-y-1">
                <Label htmlFor="breed">{t("breed")}</Label>
                <Input id="breed" {...petForm.register("breed")} />
              </div>

              {/* Color */}
              <div className="space-y-1">
                <Label htmlFor="color">Color</Label>
                <Input id="color" {...petForm.register("color")} />
              </div>

              {/* Birth date */}
              <div className="space-y-1">
                <Label htmlFor="birthDate">{t("birthDate")}</Label>
                <Input id="birthDate" type="date" {...petForm.register("birthDate")} />
              </div>

              {/* Weight */}
              <div className="space-y-1">
                <Label htmlFor="weight">{t("weight")} (kg)</Label>
                <Input id="weight" type="number" step="0.1" min="0" {...petForm.register("weight")} />
              </div>

              {/* Microchip */}
              <div className="col-span-2 space-y-1">
                <Label htmlFor="microchipNumber">{t("microchip")}</Label>
                <Input id="microchipNumber" {...petForm.register("microchipNumber")} />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep("owner")}
              >
                Atrás
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-primary text-primary-foreground"
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {tCommon("create")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
