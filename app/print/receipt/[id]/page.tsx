import { notFound } from "next/navigation";
import { getClinic } from "@/lib/clinic";
import { loadPaymentReceipt } from "@/lib/actions/billing";
import { docDate, docLocale, getDocT } from "@/lib/documents";
import { docNumber } from "@/lib/billing";
import { formatEur } from "@/lib/format";
import { formatInvoiceId } from "@/lib/utils";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { DocField, DocHeader } from "@/components/print/DocHeader";

// Receipt handed to the customer for one money movement: a payment, a refund, or the voiding of a
// payment entered by mistake. Shows what is paid and still owed on the bill when printed, so the
// customer's copy always matches the clinic's records.
export default async function ReceiptPrint({ params, searchParams }: { params: { id: string }; searchParams: { lang?: string } }) {
  const [p, clinic] = await Promise.all([loadPaymentReceipt(params.id), getClinic()]);
  if (!p) notFound();
  const locale = docLocale(searchParams.lang, clinic.dataLocale);
  const t = await getDocT(locale);
  const kind = p.voidedAt ? "void" : p.amount < 0 ? "refund" : "payment";
  const inv = p.invoice;
  const due = inv.status === "CANCELLED" ? 0 : Math.max(0, Math.round((inv.totalAmount - inv.paidAmount) * 100) / 100);
  const replaced = new Set(inv.documents.map((d) => d.replacesId).filter(Boolean));
  const docs = inv.documents.filter((d) => !replaced.has(d.id)).map((d) => docNumber(d));

  return (
    <>
      <PrintToolbar lang={locale} />
      <main className="doc-page mx-auto max-w-[210mm] bg-white p-8 my-4 shadow-sm text-[12px]">
        <DocHeader clinic={clinic} title={t(`receipt_${kind}`)} subtitle={docDate(p.voidedAt ?? p.paidAt, locale, true)} />

        <section className="grid grid-cols-2 gap-x-8 mb-6">
          <div>
            <DocField label={t("customer")} value={`${inv.pet.owner.firstName} ${inv.pet.owner.lastName}`} />
            <DocField label="NIF" value={inv.pet.owner.nif} />
            <DocField label={t("patient")} value={inv.pet.name} />
          </div>
          <div>
            <DocField label={t("receiptBill")} value={formatInvoiceId(inv.number, inv.createdAt)} />
            {docs.length > 0 && <DocField label={t("receiptDocs")} value={docs.join(", ")} />}
          </div>
        </section>

        <section className="rounded-lg border-2 border-neutral-800 p-4 mb-6">
          {kind === "void" ? (
            <>
              <p className="text-[14px]">
                {t("receiptVoidText", { amount: formatEur(p.amount), date: docDate(p.paidAt, locale, true), method: t(`method_${p.method}`) })}
              </p>
              {p.voidReason && <p className="mt-2"><span className="text-neutral-500">{t("reason")}: </span>{p.voidReason}</p>}
            </>
          ) : (
            <p className="text-[18px] font-bold">
              {kind === "refund" ? t("receiptRefunded") : t("receiptReceived")}: {formatEur(Math.abs(p.amount))}
              <span className="text-[13px] font-normal text-neutral-600"> · {t(`method_${p.method}`)}</span>
            </p>
          )}
        </section>

        <section className="mb-8">
          <p className="text-neutral-500 text-[11px] mb-1">{t("paymentStatusAt", { date: docDate(new Date(), locale, true) })}</p>
          <table className="border-collapse min-w-[280px]">
            <tbody>
              <tr><td className="pr-6 py-0.5">{t("total")}</td><td className="text-right">{formatEur(inv.totalAmount)}</td></tr>
              <tr><td className="pr-6 py-0.5">{t("paidSoFar")}</td><td className="text-right">{formatEur(inv.paidAmount)}</td></tr>
              {inv.status === "CANCELLED" ? (
                <tr><td className="pr-6 py-0.5 font-semibold" colSpan={2}>{t("receiptBillCancelled")}</td></tr>
              ) : (
                <tr className="font-semibold border-t border-neutral-400"><td className="pr-6 pt-1">{t("stillDue")}</td><td className="text-right pt-1">{formatEur(due)}</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <footer className="flex items-end justify-between gap-8 border-t border-neutral-300 pt-4 text-neutral-600">
          <p>{(kind === "void" ? p.voidedBy?.name : p.receivedBy?.name) ?? ""}</p>
          <div className="text-center">
            <div className="w-48 h-12 border-b border-neutral-500" />
            <p className="mt-1">{t("receiptCustomerSign")}</p>
          </div>
        </footer>
        {/* A payment receipt is not a tax document: the ticket / invoice (if issued) is listed above */}
        <p className="mt-6 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{t("notAnInvoice")}</p>
      </main>
    </>
  );
}
