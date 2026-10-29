"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PetFull } from "@/lib/types";
import { SpeciesBadge } from "./SpeciesBadge";
import { EditPetDialog } from "./EditPetDialog";
import { EditOwnerDialog } from "./EditOwnerDialog";
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
  AlertTriangle,
  Wallet,
  ShieldCheck,
  ShieldAlert,
  FileSignature,
} from "lucide-react";
import { OwnerDebtDialog } from "./OwnerDebtDialog";
import { ConsentDialog } from "./ConsentDialog";
import { TreatmentConsentDialog } from "./TreatmentConsentDialog";
import type { ConsentStatus } from "@/lib/actions/consents";
import { formatEur } from "@/lib/format";
import { ConditionChips } from "./ConditionsPicker";
import { format, differenceInYears, differenceInMonths } from "date-fns";
import { formatPetId } from "@/lib/utils";

function PetAge({ birthDate }: { birthDate: Date | null }) {
  const t = useTranslations("patients");
  if (!birthDate) return <span className="text-muted-foreground">—</span>;
  const years = differenceInYears(new Date(), new Date(birthDate));
  const months = differenceInMonths(new Date(), new Date(birthDate)) % 12;
  if (years === 0) return <span>{t("ageMonths", { count: months })}</span>;
  const yearsLabel = t("ageYears", { count: years });
  return <span>{months > 0 ? t("ageYearsMonths", { years: yearsLabel, months }) : yearsLabel}</span>;
}

interface PetDetailHeaderProps {
  pet: PetFull;
  // What the owner still owes across all their pets
  debt?: number;
  consent?: ConsentStatus;
  // All active pets of the owner, for documents that cover several at once
  ownerPets?: { id: string; name: string }[];
}

export function PetDetailHeader({ pet, debt = 0, consent = null, ownerPets }: PetDetailHeaderProps) {
  const t = useTranslations("patients");
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [editOwnerOpen, setEditOwnerOpen] = useState(false);
  const [isArchiving, startArchive] = useTransition();
  const [debtOpen, setDebtOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const tf = useTranslations("finances");
  const tcons = useTranslations("consent");
  const tp = useTranslations("owners");
  const ownerName = `${pet.owner.firstName} ${pet.owner.lastName}`;

  function handleArchive() {
    if (!confirm(t("archiveConfirm", { name: pet.name }))) return;
    startArchive(async () => {
      await archivePet(pet.id);
      toast.success(t("archivedToast", { name: pet.name }));
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

      {pet.alerts && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide">{t("alerts")}</p>
            <p className="text-sm whitespace-pre-line">{pet.alerts}</p>
          </div>
        </div>
      )}

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
                <span className="text-sm text-muted-foreground font-mono self-center">{formatPetId(pet.number)}</span>
                <SpeciesBadge species={pet.species} size="md" />
                {!pet.isActive && (
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    {t("archived")}
                  </span>
                )}
              </div>

              <ConditionChips conditions={pet.conditions ?? []} className="mb-2" />

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
                    {pet.gender === "MALE" ? `♂ ${t("male")}` : `♀ ${t("female")}`}
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
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Cpu className="w-3.5 h-3.5" />
                    {pet.microchipNumber}
                  </div>
                )}
                {pet.passportNumber && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="text-xs">🪪</span>
                    {pet.passportNumber}
                  </div>
                )}
                {pet.sterilized && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="text-xs font-medium text-primary">{t("sterilized")}</span>
                  </div>
                )}
              </div>

              {/* Owner info */}
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  {t("owner")}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link href={`/owners/${pet.owner.id}`} className="font-medium text-sm hover:underline">
                    {pet.owner.firstName} {pet.owner.lastName}
                    {ownerPets && ownerPets.length > 1 && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">{tp("ownerPetsCount", { count: ownerPets.length })}</span>
                    )}
                  </Link>
                  <a
                    href={`tel:${pet.owner.phone}`}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {pet.owner.phone}
                  </a>
                  {pet.owner.phone2 && (
                    <a
                      href={`tel:${pet.owner.phone2}`}
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {pet.owner.phone2}
                    </a>
                  )}
                  {pet.owner.email && (
                    <a
                      href={`mailto:${pet.owner.email}`}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {pet.owner.email}
                    </a>
                  )}
                  {pet.owner.postalCode && (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      {pet.owner.postalCode}
                      {pet.owner.address ? ` · ${pet.owner.address}` : ""}
                    </span>
                  )}
                  {!pet.owner.postalCode && pet.owner.address && (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      {pet.owner.address}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {debt > 0 && (
                    <button
                      type="button"
                      onClick={() => setDebtOpen(true)}
                      className="flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      {tf("debtBadge", { amount: formatEur(debt) })}
                    </button>
                  )}
                  {consent ? (
                    <a
                      href={`/print/consent/${consent.id}`}
                      target="_blank"
                      className="flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200"
                      title={tcons("viewSigned")}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {tcons("signedOn", { date: format(new Date(consent.signedAt), "dd/MM/yyyy") })}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConsentOpen(true)}
                      className="flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      {tcons("signNow")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTreatmentOpen(true)}
                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium border hover:bg-muted"
                  >
                    <FileSignature className="w-3.5 h-3.5" />
                    {tcons("treatmentButton")}
                  </button>
                  {consent && (
                    <button type="button" onClick={() => setConsentOpen(true)} className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
                      {tcons("signAgain")}
                    </button>
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
                {t("editPatient")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() => setEditOwnerOpen(true)}
              >
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                {t("editOwner")}
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
                  {t("archive")}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {editOpen && <EditPetDialog pet={pet} open={editOpen} onOpenChange={setEditOpen} />}
      {debtOpen && <OwnerDebtDialog ownerId={pet.owner.id} ownerName={ownerName} open={debtOpen} onOpenChange={setDebtOpen} />}
      {treatmentOpen && (
        <TreatmentConsentDialog
          ownerId={pet.owner.id}
          ownerName={ownerName}
          pets={ownerPets?.length ? ownerPets : [{ id: pet.id, name: pet.name }]}
          presetPetIds={[pet.id]}
          open={treatmentOpen}
          onOpenChange={setTreatmentOpen}
        />
      )}
      {consentOpen && <ConsentDialog ownerId={pet.owner.id} ownerName={ownerName} open={consentOpen} onOpenChange={setConsentOpen} />}
      {editOwnerOpen && <EditOwnerDialog owner={pet.owner} open={editOwnerOpen} onOpenChange={setEditOwnerOpen} />}
    </>
  );
}
