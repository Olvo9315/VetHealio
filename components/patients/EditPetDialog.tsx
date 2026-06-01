"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
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
import { cn } from "@/lib/utils";

interface EditPetDialogProps {
  pet: PetFull;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EditPetDialog({ pet, open, onOpenChange }: EditPetDialogProps) {
  const t = useTranslations("patients");
  const router = useRouter();
  const [isSaving, startSave] = useTransition();

  const [name, setName] = useState(pet.name);
  const [species, setSpecies] = useState<Species>(pet.species);
  const [breed, setBreed] = useState(pet.breed ?? "");
  const [color, setColor] = useState(pet.color ?? "");
  const [birthDate, setBirthDate] = useState(
    pet.birthDate ? format(new Date(pet.birthDate), "yyyy-MM-dd") : ""
  );
  const [weight, setWeight] = useState(pet.weight ? String(pet.weight) : "");
  const [gender, setGender] = useState<Gender | "">(pet.gender ?? "");
  const [microchipNumber, setMicrochipNumber] = useState(pet.microchipNumber ?? "");
  const [passportNumber, setPassportNumber] = useState(pet.passportNumber ?? "");
  const [sterilized, setSterilized] = useState(pet.sterilized ?? false);

  useEffect(() => {
    if (open) {
      setName(pet.name);
      setSpecies(pet.species);
      setBreed(pet.breed ?? "");
      setColor(pet.color ?? "");
      setBirthDate(pet.birthDate ? format(new Date(pet.birthDate), "yyyy-MM-dd") : "");
      setWeight(pet.weight ? String(pet.weight) : "");
      setGender(pet.gender ?? "");
      setMicrochipNumber(pet.microchipNumber ?? "");
      setPassportNumber(pet.passportNumber ?? "");
      setSterilized(pet.sterilized ?? false);
    }
  }, [open, pet]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startSave(async () => {
      const result = await updatePet(pet.id, {
        name: name.trim(),
        species,
        breed: breed || undefined,
        color: color || undefined,
        birthDate: birthDate || undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        weight: (weight || undefined) as any,
        gender: gender || undefined,
        microchipNumber: microchipNumber || undefined,
        passportNumber: passportNumber || undefined,
        sterilized,
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

        <form className="space-y-4 mt-2" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="editName">{t("name")} *</Label>
              <Input
                id="editName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label>{t("species")} *</Label>
              <Select value={species} onValueChange={(v) => setSpecies(v as Species)}>
                <SelectTrigger>
                  <SelectValue>
                    {species === "DOG" ? `🐕 ${t("dog")}` :
                     species === "CAT" ? `🐈 ${t("cat")}` :
                     species === "BIRD" ? `🦜 ${t("bird")}` :
                     species === "RABBIT" ? `🐇 ${t("rabbit")}` :
                     species === "REPTILE" ? `🦎 ${t("reptile")}` :
                     `🐾 ${t("other")}`}
                  </SelectValue>
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
            </div>

            <div className="space-y-1">
              <Label>Sexo</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as Gender | "")}>
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {gender === "MALE" ? `♂ ${t("male")}` :
                     gender === "FEMALE" ? `♀ ${t("female")}` : "—"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">♂ {t("male")}</SelectItem>
                  <SelectItem value="FEMALE">♀ {t("female")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="editBreed">{t("breed")}</Label>
              <Input
                id="editBreed"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="editColor">Color</Label>
              <Input
                id="editColor"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="editBirthDate">{t("birthDate")}</Label>
              <Input
                id="editBirthDate"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="editWeight">{t("weight")} (kg)</Label>
              <Input
                id="editWeight"
                type="number"
                step="0.1"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="editMicrochip">{t("microchip")}</Label>
              <Input
                id="editMicrochip"
                value={microchipNumber}
                onChange={(e) => setMicrochipNumber(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="editPassport">{t("passportNumber")}</Label>
              <Input
                id="editPassport"
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>{t("sterilized")}</Label>
              <button
                type="button"
                onClick={() => setSterilized(!sterilized)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm w-full transition-colors",
                  sterilized
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                <span className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                  sterilized ? "bg-primary border-primary" : "border-muted-foreground"
                )}>
                  {sterilized && <span className="text-white text-[10px] font-bold">✓</span>}
                </span>
                {sterilized ? t("sterilized") : "No esterilizado / No castrado"}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary text-primary-foreground"
              disabled={isSaving || !name.trim()}
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
