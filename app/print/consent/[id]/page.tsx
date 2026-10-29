import { notFound } from "next/navigation";
import { getClinic } from "@/lib/clinic";
import { loadConsent } from "@/lib/actions/consents";
import { docDate, docLocale, getDocT } from "@/lib/documents";
import { fileUrl } from "@/lib/storage";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { DocField, DocHeader } from "@/components/print/DocHeader";

// Copy of a signed data-protection consent, for the owner or the clinic's records
export default async function ConsentPrint({ params, searchParams }: { params: { id: string }; searchParams: { lang?: string } }) {
  const [consent, clinic] = await Promise.all([loadConsent(params.id), getClinic()]);
  if (!consent) notFound();
  const locale = docLocale(searchParams.lang, clinic.dataLocale);
  const t = await getDocT(locale);

  return (
    <>
      <PrintToolbar lang={locale} />
      <main className="doc-page mx-auto max-w-[210mm] bg-white p-8 my-4 shadow-sm text-[12px]">
        <DocHeader clinic={clinic} title={t("consentTitle")} subtitle={docDate(consent.signedAt, locale, true)} />
        <section className="mb-5 grid grid-cols-2 gap-x-8">
          <div>
            <DocField label={t("owner")} value={`${consent.owner.firstName} ${consent.owner.lastName}`} />
            <DocField label="NIF" value={consent.owner.nif} />
          </div>
          <div>
            <DocField label={t("phone")} value={consent.owner.phone} />
            <DocField label="Email" value={consent.owner.email} />
          </div>
        </section>
        <section className="mb-6 whitespace-pre-line leading-relaxed text-[12.5px]">{consent.text}</section>
        <section className="flex items-end justify-between gap-8 border-t border-neutral-300 pt-4">
          <div className="text-neutral-600">
            <p>{consent.method === "SIGNATURE" ? t("signedOnScreen") : t("acceptedByTick")}</p>
            <p>{docDate(consent.signedAt, locale, true)}{consent.recordedBy ? ` · ${consent.recordedBy.name}` : ""}</p>
          </div>
          {consent.signatureKey && (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(consent.signatureKey)} alt="" className="h-24 w-auto border-b border-neutral-500" />
              <p className="mt-1">{consent.owner.firstName} {consent.owner.lastName}</p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
