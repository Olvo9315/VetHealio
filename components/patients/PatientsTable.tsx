"use client";

import { useState, useTransition, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getPets } from "@/lib/actions/patients";
import type { PetWithOwner, PetFilters } from "@/lib/types";
import { Species } from "@prisma/client";
import { SpeciesBadge } from "./SpeciesBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, ChevronRight, PawPrint, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { NewPatientDialog } from "./NewPatientDialog";
import { cn } from "@/lib/utils";

interface PatientsTableProps {
  initialPets: PetWithOwner[];
}

export function PatientsTable({ initialPets }: PatientsTableProps) {
  const t = useTranslations("patients");
  const router = useRouter();
  const [pets, setPets] = useState<PetWithOwner[]>(initialPets);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [species, setSpecies] = useState<string>("ALL");
  const [isActive, setIsActive] = useState<string>("true");
  const [dialogOpen, setDialogOpen] = useState(false);

  const applyFilters = useCallback(
    (overrides: Partial<{ search: string; species: string; isActive: string }> = {}) => {
      const s = overrides.search ?? search;
      const sp = overrides.species ?? species;
      const ia = overrides.isActive ?? isActive;

      const filters: PetFilters = {
        search: s || undefined,
        species: sp !== "ALL" ? (sp as Species) : "ALL",
        isActive: ia === "all" ? "ALL" : ia === "true",
      };

      startTransition(async () => {
        const data = await getPets(filters);
        setPets(data);
      });
    },
    [search, species, isActive]
  );

  function handleSearchChange(value: string) {
    setSearch(value);
    if (value.length === 0 || value.length >= 2) {
      applyFilters({ search: value });
    }
  }

  function handleSpeciesChange(value: string) {
    setSpecies(value);
    applyFilters({ species: value });
  }

  function handleActiveChange(value: string) {
    setIsActive(value);
    applyFilters({ isActive: value });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            className="pl-9"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        <div className="flex gap-2 shrink-0">
          {/* Species filter */}
          <Select value={species} onValueChange={(v) => handleSpeciesChange(v ?? "ALL")}>
            <SelectTrigger className="w-36">
              <SelectValue>
                {species === "ALL" ? t("all") : species === "DOG" ? t("dog") : species === "CAT" ? t("cat") : species === "BIRD" ? t("bird") : species === "RABBIT" ? t("rabbit") : species === "REPTILE" ? t("reptile") : t("other")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("all")}</SelectItem>
              <SelectItem value="DOG">{t("dog")}</SelectItem>
              <SelectItem value="CAT">{t("cat")}</SelectItem>
              <SelectItem value="BIRD">{t("bird")}</SelectItem>
              <SelectItem value="RABBIT">{t("rabbit")}</SelectItem>
              <SelectItem value="REPTILE">{t("reptile")}</SelectItem>
              <SelectItem value="OTHER">{t("other")}</SelectItem>
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select value={isActive} onValueChange={(v) => handleActiveChange(v ?? "true")}>
            <SelectTrigger className="w-32">
              <SelectValue>
                {isActive === "all" ? t("all") : isActive === "true" ? t("active") : t("inactive")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all")}</SelectItem>
              <SelectItem value="true">{t("active")}</SelectItem>
              <SelectItem value="false">{t("inactive")}</SelectItem>
            </SelectContent>
          </Select>

          <Button
            className="bg-primary text-primary-foreground shrink-0"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("newPatient")}</span>
          </Button>
        </div>
      </div>

      {/* Loading indicator */}
      {isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Buscando...
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12"></TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("species")}</TableHead>
              <TableHead>{t("breed")}</TableHead>
              <TableHead>{t("owner")}</TableHead>
              <TableHead>{t("birthDate")}</TableHead>
              <TableHead>{t("lastVisit")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-16 text-muted-foreground">
                  <PawPrint className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {t("noPatients")}
                </TableCell>
              </TableRow>
            ) : (
              pets.map((pet) => (
                <TableRow
                  key={pet.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => router.push(`/patients/${pet.id}`)}
                >
                  <TableCell>
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                      {pet.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-base">🐾</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{pet.name}</TableCell>
                  <TableCell>
                    <SpeciesBadge species={pet.species} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{pet.breed ?? "—"}</TableCell>
                  <TableCell>
                    {pet.owner.firstName} {pet.owner.lastName}
                    <div className="text-xs text-muted-foreground">{pet.owner.phone}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {pet.birthDate ? format(new Date(pet.birthDate), "dd/MM/yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {pet.appointments?.[0]?.startTime
                      ? format(new Date(pet.appointments[0].startTime), "dd/MM/yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        pet.isActive
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {pet.isActive ? t("active") : t("inactive")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {pets.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <PawPrint className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {t("noPatients")}
          </div>
        ) : (
          pets.map((pet) => (
            <Link
              key={pet.id}
              href={`/patients/${pet.id}`}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {pet.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg">🐾</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{pet.name}</span>
                  <SpeciesBadge species={pet.species} />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {pet.owner.firstName} {pet.owner.lastName} · {pet.owner.phone}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          ))
        )}
      </div>

      {/* Count */}
      {pets.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {pets.length} paciente{pets.length !== 1 ? "s" : ""}
        </p>
      )}

      <NewPatientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(newPet) => setPets((prev) => [newPet, ...prev])}
      />
    </div>
  );
}
