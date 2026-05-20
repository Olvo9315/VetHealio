"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PetFull } from "@/lib/types";
import { SpeciesBadge } from "./SpeciesBadge";
import { EditPetDialog } from "./EditPetDialog";
import { archivePet } from "@/lib/actions/patients";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Pencil,
  Archive,
  ChevronLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Weight,
  Cpu,
} from "lucide-react";
import { format, differenceInYears, differenceInMonths } from "date-fns";

function PetAge({ birthDate }: { birthDate: Date | null }) {
  if (!birthDate) return <span className="text-muted-foreground">—</span>;
  const years = differenceInYears(new Date(), new Date(birthDate));
  const months = differenceInMonths(new Date(), new Date(birthDate)) % 12;
  if (years === 0) return <span>{months} mes{months !== 1 ? "es" : ""}</span>;
  return <span>{years} año{years !== 1 ? "s" : ""}{months > 0 ? `, ${months}m` : ""}</span>;
}

interface PetDetailHeaderProps {
  pet: PetFull;
}

export function PetDetailHeader({ pet }: PetDetailHeaderProps) {
  const t = useTranslations("patients");
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [isArchiving, startArchive] = useTransition();

  function handleArchive() {
    if (!confirm(`¿Archivar a ${pet.name}?`)) return;
    startArchive(async () => {
      await archivePet(pet.id);
      toast.success(`${pet.name} archivado`);
      router.push("/patients");
    });
  }

  return (
    <>
      {/* Back link */}
      <Link
        href="/patients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        {t("title")}
      </Link>

      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Avatar */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-muted flex items-center justify-center overflow-hidden shrink-0 text-4xl">
              {pet.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />
              ) : (
                "🐾"
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start gap-2 mb-2">
                <h2 className="text-2xl font-bold text-foreground">{pet.name}</h2>
                <SpeciesBadge species={pet.species} size="md" />
                {!pet.isActive && (
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    Archivado
                  </span>
                )}
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
                {pet.breed && (
                  <div className="flex gap-1.5 items-center text-muted-foreground">
                    <span className="font-medium text-foreground">{pet.breed}</span>
                    <span>·</span>
                    <span>{pet.color ?? ""}</span>
                  </div>
                )}
                {pet.gender && (
                  <div className="text-muted-foreground">
                    {pet.gender === "MALE" ? "♂ Macho" : "♀ Hembra"}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <PetAge birthDate={pet.birthDate} />
                  {pet.birthDate && (
                    <span className="text-xs">
                      ({format(new Date(pet.birthDate), "dd/MM/yyyy")})
                    </span>
                  )}
                </div>
                {pet.weight && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Weight className="w-3.5 h-3.5" />
                    {pet.weight} kg
                  </div>
                )}
                {pet.microchipNumber && (
                  <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                    <Cpu className="w-3.5 h-3.5" />
                    {pet.microchipNumber}
                  </div>
                )}
              </div>

              {/* Owner info */}
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  Propietario
                </p>
                <div className="flex flex-wrap gap-3">
                  <span className="font-medium text-sm">
                    {pet.owner.firstName} {pet.owner.lastName}
                  </span>
                  <a
                    href={`tel:${pet.owner.phone}`}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {pet.owner.phone}
                  </a>
                  {pet.owner.email && (
                    <a
                      href={`mailto:${pet.owner.email}`}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {pet.owner.email}
                    </a>
                  )}
                  {pet.owner.address && (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      {pet.owner.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex sm:flex-col gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Editar
              </Button>
              {pet.isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none text-muted-foreground"
                  onClick={handleArchive}
                  disabled={isArchiving}
                >
                  <Archive className="w-3.5 h-3.5 mr-1.5" />
                  Archivar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <EditPetDialog pet={pet} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
