import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { addDays } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { getClinic } from "@/lib/clinic";
import { loadPrescriptionDoc } from "@/lib/actions/prescriptions";
import { docDate, getDocT } from "@/lib/documents";
import { formatPrescriptionId } from "@/lib/utils";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { DocHeader } from "@/components/print/DocHeader";

// Days a prescription can be dispensed after it is written (RD 666/2023): shorter for antimicrobials.
// To be confirmed against the decree before relying on it.
const VALID_DAYS = 10;
const VALID_DAYS_ANTIMICROBIAL = 5;

// The browser names the PDF after the title: "Receta Rx-0067"
export async function generateMetadata({ params }: { params: { id: string } }) {
  const rx = await loadPrescriptionDoc(params.id);
  return { title: rx ? `Receta ${formatPrescriptionId(rx.number)}` : "Receta" };
}

// Veterinary prescription as handed to the owner to buy the medicine, with room for the vet's
// signature. An official document: always in Spanish.
export default async function PrescriptionPrint({ params }: { params: { id: string } }) {
  const [rx, clinic] = await Promise.all([loadPrescriptionDoc(params.id), getClinic()]);
  if (!rx) notFound();
  const t = await getDocT("es");
  const tp = await getTranslations({ locale: "es", namespace: "patients" });
  const tv = await getTranslations({ locale: "es", namespace: "presvet" });

  const pet = rx.pet;
  const owner = pet?.owner;
  const license = rx.veterinarian?.staffProfile?.licenseNumber ?? null;
  const antimicrobial = rx.items.some((i) => i.antibiotic);
  const exceptional = rx.items.some((i) => i.exceptional);
  const validUntil = addDays(rx.createdAt, antimicrobial ? VALID_DAYS_ANTIMICROBIAL : VALID_DAYS);
  // What the prescription should carry and this one lacks (shown on screen only, never printed)
  const missing = [
    !rx.veterinarian && t("rxMissingVet"),
    rx.veterinarian && !license && t("rxMissingLicense"),
    !pet?.microchipNumber && t("rxMissingChip"),
    rx.items.some((i) => !i.packages) && t("rxMissingPackages"),
  ].filter(Boolean) as string[];

  return (
    <>
      <PrintToolbar />
      {missing.length > 0 && (
        <div className="print:hidden mx-auto max-w-[210mm] mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{t("rxMissing")}: {missing.join(", ")}</p>
        </div>
      )}
      <main className="doc-page mx-auto max-w-[210mm] bg-white p-8 my-4 shadow-sm text-[12px]">
        <DocHeader clinic={clinic} title={t("rxTitle")} subtitle={`Nº ${formatPrescriptionId(rx.number)}`} />

        {(exceptional || antimicrobial) && (
          <div className="mb-4 flex flex-wrap gap-2">
            {exceptional && <span className="rounded border border-neutral-800 px-2 py-0.5 text-[11px] font-bold uppercase">{t("rxExceptional")}</span>}
            {antimicrobial && <span className="rounded border border-neutral-800 px-2 py-0.5 text-[11px] font-bold uppercase">{t("rxAntimicrobial")}</span>}
          </div>
        )}

        <section className="grid grid-cols-3 gap-6 mb-6">
          <div>
            <p className="text-neutral-500 uppercase text-[10px] tracking-wide mb-1">{t("rxPrescriber")}</p>
            <p className="font-semibold text-[13px]">{rx.veterinarian?.name ?? "—"}</p>
            <p>{t("rxLicense")}: {license ?? "—"}</p>
            {clinic.province && <p>{t("rxProvince")}: {clinic.province}</p>}
          </div>
          <div>
            <p className="text-neutral-500 uppercase text-[10px] tracking-wide mb-1">{t("rxOwner")}</p>
            <p className="font-semibold text-[13px]">{owner ? `${owner.firstName} ${owner.lastName}` : "—"}</p>
            {owner?.nif && <p>NIF: {owner.nif}</p>}
            {owner && (owner.address || owner.postalCode) && <p>{[owner.address, owner.postalCode].filter(Boolean).join(", ")}</p>}
            {owner?.phone && <p>{owner.phone}</p>}
          </div>
          <div>
            <p className="text-neutral-500 uppercase text-[10px] tracking-wide mb-1">{t("rxAnimal")}</p>
            <p className="font-semibold text-[13px]">{pet?.name ?? "—"}</p>
            {pet && <p>{tp(pet.species.toLowerCase())}{pet.breed ? ` · ${pet.breed}` : ""}</p>}
            <p>{t("rxChip")}: {pet?.microchipNumber ?? "—"}</p>
          </div>
        </section>

        <section className="space-y-3 mb-6">
          {rx.items.map((i, n) => (
            <div key={i.id} className="rounded border border-neutral-300 p-3 break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[14px] font-bold">
                  {n + 1}. {i.medicationName}
                  {i.units && <span className="font-normal"> · {i.units}</span>}
                </p>
                {i.nationalCode && <p className="font-mono">CN {i.nationalCode}</p>}
              </div>
              {i.activeIngredient && <p className="text-neutral-600">{t("rxActiveIngredient")}: {i.activeIngredient}</p>}
              <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-x-4 gap-y-1">
                <Field label={t("rxPackages")} value={i.packages != null ? String(i.packages) : "—"} />
                <Field label={t("rxRoute")} value={i.route ? tv(`route_${i.route}`) : "—"} />
                <Field label={t("rxDays")} value={i.treatmentDays != null ? String(i.treatmentDays) : "—"} />
                <Field label={t("rxPurpose")} value={i.purpose ? tv(`purpose_${i.purpose}`) : "—"} />
              </dl>
              <p className="mt-2"><span className="text-neutral-500">{t("rxPosology")}: </span><span className="font-medium">{i.posology}</span></p>
              {i.indications && <p className="mt-1"><span className="text-neutral-500">{t("rxIndications")}: </span>{i.indications}</p>}
              {i.warnings && <p className="mt-1"><span className="text-neutral-500">{t("rxWarnings")}: </span>{i.warnings}</p>}
            </div>
          ))}
        </section>

        {rx.notes && <p className="mb-6 whitespace-pre-line"><span className="text-neutral-500">{t("rxNotes")}: </span>{rx.notes}</p>}

        <footer className="grid grid-cols-2 gap-8 items-end border-t border-neutral-300 pt-4">
          <div className="space-y-1">
            <p><span className="text-neutral-500">{t("rxIssued")}: </span>{docDate(rx.createdAt, "es")}</p>
            <p className="font-semibold">{t("rxValidUntil")}: {docDate(validUntil, "es")}</p>
          </div>
          <div className="text-center">
            <div className="h-16 border-b border-neutral-500" />
            <p className="mt-1">{t("rxSignature")}</p>
            <p className="text-neutral-500 text-[11px]">{rx.veterinarian?.name ?? ""}{license ? ` · ${t("rxLicense")} ${license}` : ""}</p>
          </div>
        </footer>
      </main>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
