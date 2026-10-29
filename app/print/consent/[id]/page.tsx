import { notFound } from "next/navigation";
import { getClinic } from "@/lib/clinic";
import { loadConsent } from "@/lib/actions/consents";
import { docDate, docLocale, getDocT } from "@/lib/documents";
import { fileUrl } from "@/lib/storage";
import { isTreatmentKind, type ConsentDetails } from "@/lib/consents";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { DocField, DocHeader } from "@/components/print/DocHeader";

// Copy of a signed document (data protection or informed consent for a veterinary act), for the owner
// or the clinic's records. The body is the exact text that was accepted; ?lang only changes the labels.
export default async function ConsentPrint({ params, searchParams }: { params: { id: string }; searchParams: { lang?: string } }) {
  const [consent, clinic] = await Promise.all([loadConsent(params.id), getClinic()]);
  if (!consent) notFound();
  const details = (consent.details ?? {}) as ConsentDetails & { lang?: string };
  // Labels follow the language the text was signed in unless another one is chosen
  const locale = docLocale(searchParams.lang ?? details.lang, clinic.dataLocale);
  const t = await getDocT(locale);
  const treatment = isTreatmentKind(consent.kind);
  const signer = consent.signerName || `${consent.owner.firstName} ${consent.owner.lastName}`;

  return (
    <>
      <PrintToolbar lang={locale} />
      <main className="doc-page mx-auto max-w-[210mm] bg-white p-8 my-4 shadow-sm text-[12px]">
        <DocHeader
          clinic={clinic}
          title={treatment ? t(`consentKind_${consent.kind}`) : t("consentTitle")}
          subtitle={docDate(consent.signedAt, locale, true)}
        />
        <section className="mb-5 grid grid-cols-2 gap-x-8">
          <div>
            <DocField label={t("owner")} value={`${consent.owner.firstName} ${consent.owner.lastName}`} />
            <DocField label="NIF" value={consent.owner.nif} />
            {consent.signerName && <DocField label={t("consentSignedByLabel")} value={consent.signerName} />}
          </div>
          <div>
            <DocField label={t("phone")} value={consent.owner.phone} />
            <DocField label="Email" value={consent.owner.email} />
            {consent.pets.length > 0 && <DocField label={t("consentAnimals")} value={consent.pets.map((p) => p.name).join(", ")} />}
          </div>
        </section>
        <section className="mb-6 whitespace-pre-line leading-relaxed text-[12.5px]">{consent.text}</section>
        <section className="flex items-end justify-between gap-8 border-t border-neutral-300 pt-4">
          <div className="text-neutral-600">
            <p>{consent.method === "SIGNATURE" ? t("signedOnScreen") : t("acceptedByTick")}</p>
            <p>{docDate(consent.signedAt, locale, true)}{consent.recordedBy ? ` · ${consent.recordedBy.name}` : ""}</p>
          </div>
          <div className="flex items-end gap-10">
            {treatment && (
              <div className="text-center">
                <div className="w-48 h-24 border-b border-neutral-500" />
                <p className="mt-1">{details.vetName || t("consentVet")}</p>
                {details.vetLicense && <p className="text-neutral-500">{t("consentLicense")} {details.vetLicense}</p>}
              </div>
            )}
            <div className="text-center">
              {consent.signatureKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(consent.signatureKey)} alt="" className="h-24 w-auto border-b border-neutral-500" />
              ) : (
                <div className="w-48 h-24 border-b border-neutral-500" />
              )}
              <p className="mt-1">{signer}</p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
