import { notFound } from "next/navigation";
import { getClinic } from "@/lib/clinic";
import { loadFiscalDocument } from "@/lib/actions/billing";
import { docDate, docLocale, getDocT } from "@/lib/documents";
import { docNumber, type DocLine, type TaxRow } from "@/lib/billing";
import { formatEur } from "@/lib/format";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { DocHeader } from "@/components/print/DocHeader";

// A fiscal document (ticket, full invoice or rectifying invoice) as handed to the customer
export default async function InvoicePrint({ params, searchParams }: { params: { id: string }; searchParams: { lang?: string } }) {
  const [doc, clinic] = await Promise.all([loadFiscalDocument(params.id), getClinic()]);
  if (!doc) notFound();
  const locale = docLocale(searchParams.lang, clinic.dataLocale);
  const t = await getDocT(locale);
  const lines = doc.lines as DocLine[];
  const taxes = doc.taxBreakdown as TaxRow[];
  const title = { SIMPLIFIED: t("simplifiedInvoice"), FULL: t("fullInvoice"), RECTIFYING: t("rectifyingInvoice") }[doc.kind];
  const methods = Array.from(new Set(doc.invoice.payments.filter((p) => p.amount > 0).map((p) => p.method)));
  const paid = doc.invoice.paidAmount;
  const due = Math.max(0, Math.round((doc.invoice.totalAmount - paid) * 100) / 100);

  return (
    <>
      <PrintToolbar lang={locale} />
      <main className="doc-page mx-auto max-w-[210mm] bg-white p-8 my-4 shadow-sm text-[12px]">
        <DocHeader clinic={clinic} title={title} subtitle={`Nº ${docNumber(doc)}`} />

        <section className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <p className="text-neutral-500 uppercase text-[10px] tracking-wide mb-1">{t("customer")}</p>
            <p className="font-semibold text-[13px]">{doc.customerName}</p>
            {doc.customerNif && <p>NIF: {doc.customerNif}</p>}
            {doc.customerAddress && <p>{doc.customerAddress}</p>}
            <p className="text-neutral-500 mt-1">{t("patient")}: {doc.invoice.pet.name}</p>
          </div>
          <div className="text-right">
            <p><span className="text-neutral-500">{t("issueDate")}: </span>{docDate(doc.issuedAt, locale)}</p>
            {doc.replaces && (
              <p className="mt-1">
                <span className="text-neutral-500">{doc.kind === "RECTIFYING" ? t("rectifies") : t("replaces")}: </span>
                {docNumber(doc.replaces)} ({docDate(doc.replaces.issuedAt, locale)})
              </p>
            )}
            {doc.reason && <p className="mt-1"><span className="text-neutral-500">{t("reason")}: </span>{doc.reason}</p>}
          </div>
        </section>

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
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-neutral-200 align-top">
                <td className="py-1.5 pr-2">{l.description}</td>
                <td className="py-1.5 px-2 text-right">{l.quantity}</td>
                <td className="py-1.5 px-2 text-right">{formatEur(l.unitPrice)}</td>
                <td className="py-1.5 px-2 text-right">{l.taxRate}%</td>
                <td className="py-1.5 pl-2 text-right">{formatEur(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="flex justify-end mb-8">
          <table className="border-collapse min-w-[300px]">
            <thead>
              <tr className="text-neutral-500 text-[11px]">
                <th className="text-left font-normal pr-4">{t("vat")}</th>
                <th className="text-right font-normal px-2">{t("taxBase")}</th>
                <th className="text-right font-normal pl-2">{t("taxAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {taxes.map((r) => (
                <tr key={r.rate}>
                  <td className="pr-4">{r.rate}%</td>
                  <td className="text-right px-2">{formatEur(r.base)}</td>
                  <td className="text-right pl-2">{formatEur(r.tax)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-800 text-[15px] font-bold">
                <td className="pt-2 pr-4">{t("total")}</td>
                <td />
                <td className="pt-2 text-right pl-2">{formatEur(doc.total)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* What has actually been paid when this copy is printed: the invoice itself only records the service */}
        {doc.kind !== "RECTIFYING" && doc.invoice.status !== "CANCELLED" && (
          <section className="mb-3 rounded border border-neutral-300 px-3 py-2">
            <p className="text-neutral-500 text-[11px]">{t("paymentStatusAt", { date: docDate(new Date(), locale, true) })}</p>
            <p className="text-[13px]">
              <span className="font-semibold">{t("paidSoFar")}: {formatEur(paid)}</span>
              {methods.length > 0 && <span className="text-neutral-600"> ({methods.map((m) => t(`method_${m}`)).join(", ")})</span>}
              {due > 0.005 && <span className="ml-3 font-semibold text-red-700">{t("stillDue")}: {formatEur(due)}</span>}
            </p>
          </section>
        )}
        {clinic.iban && doc.kind === "FULL" && <p className="mb-2"><span className="text-neutral-500">IBAN: </span>{clinic.iban}</p>}
        {clinic.invoiceFooter && <p className="mt-6 text-[10px] text-neutral-500 whitespace-pre-line">{clinic.invoiceFooter}</p>}
      </main>
    </>
  );
}
