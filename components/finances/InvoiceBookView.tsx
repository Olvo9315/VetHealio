"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { format, subMonths } from "date-fns";
import { Download, FileCheck2, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { getInvoiceBook, issuePendingTickets, type BookRow } from "@/lib/actions/billing";
import { cents, downloadCsv, formatEur } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const kindLabel = { SIMPLIFIED: "docSimplified", FULL: "docFull", RECTIFYING: "docRectifying" } as const;

// Invoices issued in a month (libro registro de facturas emitidas): what the tax adviser needs.
// Tickets replaced by a full invoice are shown crossed out and left out of the totals.
export function InvoiceBookView() {
  const t = useTranslations("finances");
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [rows, setRows] = useState<BookRow[]>([]);
  const [pending, setPending] = useState(0);
  const [nifMissing, setNifMissing] = useState(false);
  const [isLoading, startLoad] = useTransition();
  const [isIssuing, startIssue] = useTransition();

  const load = (m: string) => startLoad(async () => {
    const book = await getInvoiceBook(m);
    setRows(book.rows);
    setPending(book.pendingTickets);
    setNifMissing(book.clinicNifMissing);
  });
  useEffect(() => { load(month); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const counted = rows.filter((r) => !r.replacedBy);
  const totals = useMemo(() => {
    const byRate = new Map<number, { base: number; tax: number }>();
    for (const r of counted) for (const x of r.taxBreakdown) {
      const cur = byRate.get(x.rate) ?? { base: 0, tax: 0 };
      byRate.set(x.rate, { base: cents(cur.base + x.base), tax: cents(cur.tax + x.tax) });
    }
    return {
      byRate: Array.from(byRate.entries()).sort((a, b) => b[0] - a[0]),
      base: cents(counted.reduce((s, r) => s + r.taxBase, 0)),
      tax: cents(counted.reduce((s, r) => s + r.taxAmount, 0)),
      total: cents(counted.reduce((s, r) => s + r.total, 0)),
    };
  }, [counted]);

  function exportCsv() {
    const rates = Array.from(new Set(rows.flatMap((r) => r.taxBreakdown.map((x) => x.rate)))).sort((a, b) => b - a);
    downloadCsv(`${t("bookFile")}_${month}`, [
      [t("docNumber"), t("docType"), t("date"), t("customerName"), "NIF", ...rates.flatMap((r) => [`${t("taxBase")} ${r}%`, `IVA ${r}%`]), t("taxBase"), "IVA", t("total"), t("notes")],
      ...rows.map((r) => [
        r.docNumber,
        t(kindLabel[r.kind]),
        format(new Date(r.issuedAt), "dd/MM/yyyy"),
        r.customerName,
        r.customerNif ?? "",
        ...rates.flatMap((rate) => {
          const x = r.taxBreakdown.find((b) => b.rate === rate);
          return [x ? x.base.toFixed(2) : "", x ? x.tax.toFixed(2) : ""];
        }),
        r.taxBase.toFixed(2),
        r.taxAmount.toFixed(2),
        r.total.toFixed(2),
        r.replacedBy ? t("replacedBy", { doc: r.replacedBy }) : r.replaces ? (r.kind === "RECTIFYING" ? t("rectifiesDoc", { doc: r.replaces }) : t("replacesDoc", { doc: r.replaces })) : "",
      ]),
    ]);
  }

  const months = Array.from({ length: 13 }, (_, i) => format(subMonths(new Date(), i), "yyyy-MM"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Input list="book-months" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-9 w-[170px]" />
        <datalist id="book-months">{months.map((m) => <option key={m} value={m} />)}</datalist>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={!rows.length}>
            <Download className="w-4 h-4" />
            {t("exportForAdviser")}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            {t("printBook")}
          </Button>
        </div>
      </div>

      {nifMissing && (
        <div className="rounded-xl border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm print:hidden">
          {t("clinicNifMissing")}{" "}
          <a href="/settings" className="underline font-medium">{t("openSettings")}</a>
        </div>
      )}

      {pending > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 print:hidden">
          <p className="text-sm flex-1 min-w-[200px]">{t("pendingTickets", { count: pending })}</p>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={isIssuing}
            onClick={() =>
              startIssue(async () => {
                const { issued } = await issuePendingTickets(month);
                toast.success(t("ticketsIssued", { count: issued }));
                load(month);
              })
            }
          >
            {isIssuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
            {t("issueTicketsNow")}
          </Button>
        </div>
      )}

      {/* Tax summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Box label={t("docsCount")} value={String(counted.length)} />
        <Box label={t("taxBase")} value={formatEur(totals.base)} />
        <Box label={t("vatTotal")} value={formatEur(totals.tax)} />
        <Box label={t("total")} value={formatEur(totals.total)} strong />
      </div>
      {totals.byRate.length > 0 && (
        <div className="rounded-xl border bg-card p-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
          {totals.byRate.map(([rate, v]) => (
            <span key={rate}>IVA {rate}%: {t("baseAndTax", { base: formatEur(v.base), tax: formatEur(v.tax) })}</span>
          ))}
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">{t("noDocsMonth")}</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">{t("docNumber")}</th>
                <th className="text-left font-medium px-3 py-2">{t("date")}</th>
                <th className="text-left font-medium px-3 py-2">{t("customerName")}</th>
                <th className="text-right font-medium px-3 py-2">{t("taxBase")}</th>
                <th className="text-right font-medium px-3 py-2">IVA</th>
                <th className="text-right font-medium px-3 py-2">{t("total")}</th>
                <th className="w-8 print:hidden" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className={cn(r.replacedBy && "text-muted-foreground")}>
                  <td className="px-3 py-2">
                    <span className={cn("font-mono", r.replacedBy && "line-through")}>{r.docNumber}</span>
                    <p className="text-[11px] text-muted-foreground">
                      {t(kindLabel[r.kind])}
                      {r.replacedBy && ` · ${t("replacedBy", { doc: r.replacedBy })}`}
                      {r.replaces && !r.replacedBy && ` · ${r.kind === "RECTIFYING" ? t("rectifiesDoc", { doc: r.replaces }) : t("replacesDoc", { doc: r.replaces })}`}
                    </p>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{format(new Date(r.issuedAt), "dd/MM/yyyy")}</td>
                  <td className="px-3 py-2">
                    {r.customerName}
                    {r.customerNif && <span className="text-xs text-muted-foreground"> · {r.customerNif}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{formatEur(r.taxBase)}</td>
                  <td className="px-3 py-2 text-right">{formatEur(r.taxAmount)}</td>
                  <td className={cn("px-3 py-2 text-right font-medium", r.total < 0 && "text-red-600")}>{formatEur(r.total)}</td>
                  <td className="px-1 print:hidden">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => window.open(`/print/invoice/${r.id}`, "_blank")}>
                      <Printer className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted-foreground print:hidden">{t("bookHint")}</p>
    </div>
  );
}

function Box({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", strong ? "bg-primary/5 border-primary/30" : "bg-card")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-semibold", strong ? "text-xl" : "text-lg")}>{value}</p>
    </div>
  );
}
