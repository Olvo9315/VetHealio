"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { AlertTriangle, ChevronLeft, FileSignature, Mail, MapPin, Pencil, Phone, Plus, Printer, ShieldAlert, ShieldCheck, Stethoscope, Wallet } from "lucide-react";
import type { Owner, Species } from "@prisma/client";
import type { ConsentStatus, OwnerDocument } from "@/lib/actions/consents";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SpeciesBadge } from "./SpeciesBadge";
import { ConditionChips } from "./ConditionsPicker";
import { EditOwnerDialog } from "./EditOwnerDialog";
import { OwnerDebtDialog } from "./OwnerDebtDialog";
import { ConsentDialog } from "./ConsentDialog";
import { TreatmentConsentDialog } from "./TreatmentConsentDialog";
import { NewPatientDialog } from "./NewPatientDialog";
import { dueOf } from "@/lib/billing";
import { formatEur } from "@/lib/format";
import { cn, formatInvoiceId, formatPetId } from "@/lib/utils";

type Pet = { id: string; number: number; name: string; species: Species; breed: string | null; birthDate: Date | null; isActive: boolean; alerts: string | null; conditions: string[] };
type Bill = {
  id: string;
  number: number;
  status: "PENDING" | "PAID" | "CANCELLED";
  totalAmount: number;
  paidAmount: number;
  createdAt: Date;
  pet: { id: string; name: string };
  appointment: { title: string } | null;
};

export function OwnerOverview({
  owner,
  bills,
  debt,
  consent,
  documents,
}: {
  owner: Owner & { pets: Pet[] };
  bills: Bill[];
  debt: number;
  consent: ConsentStatus;
  documents: OwnerDocument[];
}) {
  const t = useTranslations("owners");
  const tp = useTranslations("patients");
  const tf = useTranslations("finances");
  const tc = useTranslations("consent");
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [debtOpen, setDebtOpen] = useState(false);
  const [rgpdOpen, setRgpdOpen] = useState(false);
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [newPetOpen, setNewPetOpen] = useState(false);
  const name = `${owner.firstName} ${owner.lastName}`;
  const activePets = owner.pets.filter((p) => p.isActive);

  return (
    <div className="space-y-4">
      <Link href="/patients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-4 h-4" />
        {tp("title")}
      </Link>

      {/* Owner */}
      <Card>
        <CardContent className="p-4 md:p-6 space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("owner")}</p>
              <h2 className="text-2xl font-bold">{name}</h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm">
                <a href={`tel:${owner.phone}`} className="flex items-center gap-1 text-primary hover:underline"><Phone className="w-3.5 h-3.5" />{owner.phone}</a>
                {owner.phone2 && <a href={`tel:${owner.phone2}`} className="flex items-center gap-1 text-primary hover:underline"><Phone className="w-3.5 h-3.5" />{owner.phone2}</a>}
                {owner.email && <a href={`mailto:${owner.email}`} className="flex items-center gap-1 text-muted-foreground"><Mail className="w-3.5 h-3.5" />{owner.email}</a>}
                {(owner.address || owner.postalCode) && (
                  <span className="flex items-center gap-1 text-muted-foreground"><MapPin className="w-3.5 h-3.5" />{[owner.address, owner.postalCode].filter(Boolean).join(", ")}</span>
                )}
                {owner.nif && <span className="text-muted-foreground">NIF {owner.nif}</span>}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              {tp("editOwner")}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {debt > 0 ? (
              <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700 text-white" onClick={() => setDebtOpen(true)}>
                <Wallet className="w-4 h-4" />
                {t("payAll", { amount: formatEur(debt) })}
              </Button>
            ) : (
              <span className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                <Wallet className="w-3.5 h-3.5" />{t("noDebt")}
              </span>
            )}
            {consent ? (
              <a href={`/print/consent/${consent.id}`} target="_blank" className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                {tc("signedOn", { date: format(new Date(consent.signedAt), "dd/MM/yyyy") })}
              </a>
            ) : (
              <button type="button" onClick={() => setRgpdOpen(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                <ShieldAlert className="w-3.5 h-3.5" />{tc("signNow")}
              </button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" disabled={!activePets.length} onClick={() => setTreatmentOpen(true)}>
              <FileSignature className="w-4 h-4" />
              {tc("treatmentButton")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pets */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("pets", { count: owner.pets.length })}</h3>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setNewPetOpen(true)}>
            <Plus className="w-4 h-4" />{t("addPet")}
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {owner.pets.map((p) => (
            <Link key={p.id} href={`/patients/${p.id}`} className={cn("rounded-xl border bg-card p-3 hover:border-primary/40 transition-colors", !p.isActive && "opacity-60")}>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs font-mono text-muted-foreground">{formatPetId(p.number)}</span>
                <SpeciesBadge species={p.species} size="sm" />
                {!p.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted">{tp("archived")}</span>}
              </div>
              {p.breed && <p className="text-xs text-muted-foreground mt-0.5">{p.breed}</p>}
              {p.alerts && <p className="text-xs text-red-700 dark:text-red-300 mt-1 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /><span className="line-clamp-1">{p.alerts}</span></p>}
              <ConditionChips conditions={p.conditions} className="mt-1.5" />
            </Link>
          ))}
        </div>
      </section>

      {/* Bills of all pets */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("bills")}</h3>
        <div className="rounded-xl border bg-card divide-y">
          {bills.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">{tp("noInvoices")}</p>}
          {bills.map((b) => {
            const due = dueOf(b);
            return (
              <Link key={b.id} href={`/patients/${b.pet.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{b.pet.name} · {b.appointment?.title ?? tf("noAppointment")}</p>
                  <p className="text-xs text-muted-foreground"><span className="font-mono">{formatInvoiceId(b.number, b.createdAt)}</span> · {format(new Date(b.createdAt), "dd/MM/yyyy")}</p>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-semibold", b.status === "CANCELLED" && "line-through text-muted-foreground")}>{formatEur(b.totalAmount)}</p>
                  {due > 0 ? (
                    <p className="text-xs text-red-600 dark:text-red-400">{tf("dueShort", { amount: formatEur(due) })}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{tf(b.status === "CANCELLED" ? "cancelled" : "paid")}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Signed documents */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("documents")}</h3>
        </div>
        <div className="rounded-xl border bg-card divide-y">
          {documents.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">{t("noDocuments")}</p>}
          {documents.map((d) => (
            <a key={d.id} href={`/print/consent/${d.id}`} target="_blank" className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
              {d.kind === "rgpd" ? <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /> : <Stethoscope className="w-4 h-4 text-primary shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {d.kind === "rgpd" ? tc("rgpdDoc") : tc(`kind_${d.kind}`)}
                  {d.petNames.length > 0 && <span className="font-normal text-muted-foreground"> · {d.petNames.join(", ")}</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {format(new Date(d.signedAt), "dd/MM/yyyy HH:mm")}
                  {d.procedure && ` · ${d.procedure}`}
                  {d.signerName && ` · ${tc("signedBy", { name: d.signerName })}`}
                </p>
              </div>
              <Printer className="w-4 h-4 text-muted-foreground" />
            </a>
          ))}
        </div>
      </section>

      {editOpen && <EditOwnerDialog owner={owner} open={editOpen} onOpenChange={setEditOpen} />}
      {debtOpen && <OwnerDebtDialog ownerId={owner.id} ownerName={name} open={debtOpen} onOpenChange={setDebtOpen} />}
      {rgpdOpen && <ConsentDialog ownerId={owner.id} ownerName={name} open={rgpdOpen} onOpenChange={setRgpdOpen} />}
      {treatmentOpen && (
        <TreatmentConsentDialog
          ownerId={owner.id}
          ownerName={name}
          pets={activePets.map((p) => ({ id: p.id, name: p.name }))}
          presetPetIds={activePets.map((p) => p.id)}
          open={treatmentOpen}
          onOpenChange={setTreatmentOpen}
        />
      )}
      <NewPatientDialog
        open={newPetOpen}
        onOpenChange={setNewPetOpen}
        presetOwner={{ id: owner.id, firstName: owner.firstName, lastName: owner.lastName, phone: owner.phone, email: owner.email }}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
