"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Species, Gender } from "@prisma/client";
import { updatePet } from "@/lib/actions/patients";
import type { PetFull } from "@/lib/types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

const editPetSchema = z.object({
  name: z.string().min(1, "Requerido"),
  species: z.nativeEnum(Species),
  breed: z.string().optional(),
  color: z.string().optional(),
  birthDate: z.string().optional(),
  weight: z.string().optional(),
  gender: z.nativeEnum(Gender).optional().or(z.literal("" as const)),
  microchipNumber: z.string().optional(),
});

type EditPetForm = z.infer<typeof editPetSchema>;

interface EditPetDialogProps {
  pet: PetFull;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EditPetDialog({ pet, open, onOpenChange }: EditPetDialogProps) {
  const t = useTranslations("patients");
  const router = useRouter();
  const [isSaving, startSave] = useTransition();

  const form = useForm<EditPetForm>({
    resolver: zodResolver(editPetSchema),
    defaultValues: {
      name: pet.name,
      species: pet.species,
      breed: pet.breed ?? "",
      color: pet.color ?? "",
      birthDate: pet.birthDate ? format(new Date(pet.birthDate), "yyyy-MM-dd") : "",
      weight: pet.weight ? String(pet.weight) : "",
      gender: pet.gender ?? "",
      microchipNumber: pet.microchipNumber ?? "",
    },
  });

  function handleSubmit(data: EditPetForm) {
    startSave(async () => {
      const result = await updatePet(pet.id, {
        ...data,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        weight: (data.weight || "") as any,
        gender: data.gender || "",
      });
      if ("error" in result) {
        toast.error("Error al actualizar paciente");
        return;
      }
      toast.success(`${result.pet.name} actualizado`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar paciente</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="editName">{t("name")} *</Label>
              <Input id="editName" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>{t("species")} *</Label>
              <Select
                defaultValue={pet.species}
                onValueChange={(v) => form.setValue("species", (v ?? "") as Species)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOG">🐕 {t("dog")}</SelectItem>
                  <SelectItem value="CAT">🐈 {t("cat")}</SelectItem>
                  <SelectItem value="BIRD">🦜 {t("bird")}</SelectItem>
                  <SelectItem value="RABBIT">🐇 {t("rabbit")}</SelectItem>
                  <SelectItem value="REPTILE">🦎 {t("reptile")}</SelectItem>
                  <SelectItem value="OTHER">🐾 {t("other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Sexo</Label>
              <Select
                defaultValue={pet.gender ?? ""}
                onValueChange={(v) => form.setValue("gender", (v ?? "") as Gender | "")}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">♂ {t("male")}</SelectItem>
                  <SelectItem value="FEMALE">♀ {t("female")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="editBreed">{t("breed")}</Label>
              <Input id="editBreed" {...form.register("breed")} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="editColor">Color</Label>
              <Input id="editColor" {...form.register("color")} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="editBirthDate">{t("birthDate")}</Label>
              <Input id="editBirthDate" type="date" {...form.register("birthDate")} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="editWeight">{t("weight")} (kg)</Label>
              <Input id="editWeight" type="number" step="0.1" min="0" {...form.register("weight")} />
            </div>

            <div className="col-span-2 space-y-1">
              <Label htmlFor="editMicrochip">{t("microchip")}</Label>
              <Input id="editMicrochip" {...form.register("microchipNumber")} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-primary text-primary-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
