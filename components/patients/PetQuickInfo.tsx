"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { differenceInMonths, differenceInYears, format } from "date-fns";
import { Loader2, Syringe } from "lucide-react";
import { getPetQuickInfo, type PetQuickInfo as PetInfo } from "@/lib/actions/appointments";
import { cn } from "@/lib/utils";

const SPECIES_EMOJI: Record<string, string> = { DOG: "🐕", CAT: "🐈", BIRD: "🦜", RABBIT: "🐇", REPTILE: "🦎", OTHER: "🐾" };

// Shared between all cards on the page: hovering the same pet twice doesn't refetch
const cache = new Map<string, Promise<PetInfo | null>>();
function loadPet(petId: string) {
  if (!cache.has(petId)) {
    const p = getPetQuickInfo(petId).catch(() => {
      cache.delete(petId);
      return null;
    });
    cache.set(petId, p);
  }
  return cache.get(petId)!;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{children}</span>
    </div>
  );
}

// Age, weight, sex/neutering, chip and latest vaccinations of a pet
export function PetQuickInfo({ petId, className }: { petId: string; className?: string }) {
  const t = useTranslations("patients");
  const tp = useTranslations("petInfo");
  const [pet, setPet] = useState<PetInfo | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setPet(undefined);
    loadPet(petId).then((p) => alive && setPet(p));
    return () => {
      alive = false;
    };
  }, [petId]);

  if (pet === undefined) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground py-2", className)}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {tp("loading")}
      </div>
    );
  }
  if (pet === null) return <p className={cn("text-xs text-muted-foreground py-2", className)}>{tp("notFound")}</p>;

  let age = "—";
  if (pet.birthDate) {
    const years = differenceInYears(new Date(), new Date(pet.birthDate));
    const months = differenceInMonths(new Date(), new Date(pet.birthDate)) % 12;
    const yearsLabel = t("ageYears", { count: years });
    age = years === 0 ? t("ageMonths", { count: months }) : months > 0 ? t("ageYearsMonths", { years: yearsLabel, months }) : yearsLabel;
  }
  const speciesKey = pet.species.toLowerCase() as "dog";
  const today = new Date();

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-xs font-semibold">
        {SPECIES_EMOJI[pet.species] ?? "🐾"} {t(speciesKey)}
        {pet.breed && <span className="font-normal text-muted-foreground"> · {pet.breed}</span>}
      </p>
      <Row label={tp("age")}>{age}</Row>
      <Row label={t("weight")}>{pet.weight != null ? `${pet.weight} kg` : "—"}</Row>
      <Row label={t("gender")}>{pet.gender ? t(pet.gender === "MALE" ? "male" : "female") : "—"}</Row>
      <Row label={tp("neutered")}>
        {pet.sterilized == null ? "—" : pet.sterilized ? tp("yes") : tp("no")}
      </Row>
      {pet.microchipNumber && <Row label={t("microchip")}>{pet.microchipNumber}</Row>}

      <div className="pt-1 border-t border-border/50 space-y-1">
        <p className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          <Syringe className="w-3 h-3" /> {t("vaccinations")}
        </p>
        {pet.vaccinations.length === 0 ? (
          <p className="text-xs text-muted-foreground">{tp("noVaccinations")}</p>
        ) : (
          pet.vaccinations.slice(0, 5).map((v) => {
            const overdue = v.nextDueDate && new Date(v.nextDueDate) < today;
            return (
              <div key={v.vaccineName} className="text-xs flex justify-between gap-2">
                <span className="truncate">{v.vaccineName}</span>
                <span className={cn("shrink-0", overdue ? "text-red-600 font-semibold" : "text-muted-foreground")}>
                  {format(new Date(v.dateAdministered), "dd.MM.yy")}
                  {v.nextDueDate && ` → ${format(new Date(v.nextDueDate), "dd.MM.yy")}`}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
