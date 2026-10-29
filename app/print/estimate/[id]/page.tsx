import { notFound } from "next/navigation";
import { getClinic } from "@/lib/clinic";
import { getEstimate } from "@/lib/actions/estimates";
import { docDate, docLocale, getDocT } from "@/lib/documents";
import { taxBreakdown } from "@/lib/billing";
import { formatEur } from "@/lib/format";
import { formatEstimateId } from "@/lib/utils";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { DocHeader } from "@/components/print/DocHeader";

// Presupuesto as given to the owner, with room to sign it as accepted
export default async function EstimatePrint({ params, searchParams }: { params: { id: string }; searchParams: { lang?: string } }) {
  const [est, clinic] = await Promise.all([getEstimate(params.id), getClinic()]);
  if (!est) notFound();
  const locale = docLocale(searchParams.lang, clinic.dataLocale);
  const t = await getDocT(locale);
  const taxes = taxBreakdown(est.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate, total: i.total })));
  const owner = est.pet.owner;

  return (
    <>
      <PrintToolbar lang={locale} />
      <main className="doc-page mx-auto max-w-[210mm] bg-white p-8 my-4 shadow-sm text-[12px]">
        <DocHeader clinic={clinic} title={t("estimate")} subtitle={`Nº ${formatEstimateId(est.number)}`} />

        <section className="grid grid-cols-2 gap-8 mb-5">
          <div>
            <p className="text-neutral-500 uppercase text-[10px] tracking-wide mb-1">{t("customer")}</p>
            <p className="font-semibold text-[13px]">{owner.firstName} {owner.lastName}</p>
            {owner.phone && <p>{owner.phone}</p>}
            <p className="text-neutral-500 mt-1">{t("patient")}: {est.pet.name}</p>
          </div>
          <div className="text-right">
            <p><span className="text-neutral-500">{t("issueDate")}: </span>{docDate(est.createdAt, locale)}</p>
            <p className="mt-1 font-semibold">{t("validUntil", { date: docDate(est.validUntil, locale) })}</p>
          </div>
        </section>

        <h2 className="text-[15px] font-semibold mb-3">{est.title}</h2>

        <table className="w-full border-collapse mb-6">
          <thead>
            <tr className="border-b-2 border-neutral-800 text-left">
              <th className="py-1.5 pr-2 font-semibold">{t("description")}</th>
              <th className="py-1.5 px-2 font-semibold text-right w-14">{t("qty")}</th>
              <th className="py-1.5 px-2 font-semibold text-right w-24">{t("price")}</th>
              <th className="py-1.5 px-2 font-semibold text-right w-14">{t("vat")}</th>
              <th className="py-1.5 pl-2 font-semibold text-right w-24">{t("amount")}</th>
            </tr>
          </thead>
          <tbody>
            {est.items.map((l) => (
              <tr key={l.id} className="border-b border-neutral-200 align-top">
                <td className="py-1.5 pr-2">{l.description}</td>
                <td className="py-1.5 px-2 text-right">{l.quantity}</td>
                <td className="py-1.5 px-2 text-right">{formatEur(l.unitPrice)}</td>
                <td className="py-1.5 px-2 text-right">{l.taxRate}%</td>
                <td className="py-1.5 pl-2 text-right">{formatEur(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="flex justify-end mb-6">
          <table className="border-collapse min-w-[300px]">
            <thead>
              <tr className="text-neutral-500 text-[11px]">
                <th className="text-left font-normal pr-4">{t("vat")}</th>
                <th className="text-right font-normal px-2">{t("taxBase")}</th>
                <th className="text-right font-normal pl-2">{t("taxAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {taxes.rows.map((r) => (
                <tr key={r.rate}>
                  <td className="pr-4">{r.rate}%</td>
                  <td className="text-right px-2">{formatEur(r.base)}</td>
                  <td className="text-right pl-2">{formatEur(r.tax)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-800 text-[15px] font-bold">
                <td className="pt-2 pr-4">{t("total")}</td>
                <td />
                <td className="pt-2 text-right pl-2">{formatEur(est.total)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {est.notes && <p className="mb-5 whitespace-pre-line">{est.notes}</p>}
        <p className="mb-8 text-[11px] text-neutral-600">{t("estimateTerms")}</p>

        <footer className="flex items-end justify-between gap-8 border-t border-neutral-300 pt-4 text-neutral-600">
          <p>{est.createdBy?.name ?? ""}</p>
          <div className="text-center">
            <div className="w-56 h-12 border-b border-neutral-500" />
            <p className="mt-1">{t("estimateAcceptSign")}</p>
          </div>
        </footer>
        <p className="mt-6 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{t("estimateNotInvoice")}</p>
      </main>
    </>
  );
}
