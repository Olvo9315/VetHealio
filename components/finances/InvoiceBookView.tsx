"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { endOfMonth, endOfQuarter, endOfYear, format, startOfMonth, startOfQuarter, startOfYear } from "date-fns";
import { CheckCircle2, Download, FileCheck2, FileText, Loader2, Mail, Printer, Send } from "lucide-react";
import { toast } from "sonner";
import { getInvoiceBook, issuePendingTickets, recordAdviserExport, sendBookToAdviser, type InvoiceBook } from "@/lib/actions/billing";
import { cents, formatEur } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const kindLabel = { SIMPLIFIED: "docSimplified", FULL: "docFull", RECTIFYING: "docRectifying" } as const;
type Mode = "month" | "quarter" | "year" | "range";
const DAY = "yyyy-MM-dd";

function rangeOf(mode: Exclude<Mode, "range">, anchor: Date): [string, string] {
  const r = {
    month: [startOfMonth(anchor), endOfMonth(anchor)],
    quarter: [startOfQuarter(anchor), endOfQuarter(anchor)],
    year: [startOfYear(anchor), endOfYear(anchor)],
  }[mode];
  return [format(r[0], DAY), format(r[1], DAY)];
}

// Invoices issued in a period (libro registro de facturas emitidas): what the tax adviser needs.
// Choose a month, a quarter (VAT returns are usually quarterly), a year or any dates; download the
// PDF (summary, register and every invoice) or Excel, or e-mail it to the adviser. Documents that
// were already handed over are marked; issued documents are never edited anyway.
export function InvoiceBookView() {
  const t = useTranslations("finances");
  const ta = useTranslations("adviser");
  const [mode, setMode] = useState<Mode>("quarter");
  const [[from, to], setRange] = useState<[string, string]>(() => rangeOf("quarter", new Date()));
  const [book, setBook] = useState<InvoiceBook | null>(null);
  const [isLoading, startLoad] = useTransition();
  const [isBusy, startBusy] = useTransition();
  const [withInvoices, setWithInvoices] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const load = () => startLoad(async () => {
    const b = await getInvoiceBook(from, to);
    setBook(b);
    setEmail((cur) => cur || b.adviserEmail || "");
  });
  useEffect(() => { if (from && to && from <= to) load(); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = book?.rows ?? [];
  const counted = rows.filter((r) => !r.replacedBy);
  const unsent = rows.filter((r) => !r.sentAt).length;
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

  function choose(m: Mode) {
    setMode(m);
    if (m !== "range") setRange(rangeOf(m, new Date(`${from}T12:00:00`)));
  }

  const year = Number(from.slice(0, 4));
  const fileUrl = (fmt: "pdf" | "csv") => `/api/finances/adviser?from=${from}&to=${to}&format=${fmt}${withInvoices ? "&invoices=1" : ""}`;

  function markSent() {
    if (!confirm(ta("markSentConfirm", { count: rows.length }))) return;
    startBusy(async () => {
      await recordAdviserExport(from, to, "MANUAL");
      toast.success(ta("markedSent"));
      load();
    });
  }

  function send() {
    startBusy(async () => {
      const r = await sendBookToAdviser({ from, to, email, includeInvoices: withInvoices, message });
      if ("error" in r) { toast.error(ta(`err_${r.error}`)); return; }
      toast.success(ta("sent", { email }));
      setSendOpen(false);
      load();
    });
  }

  return (
    <div className="space-y-4">
      {/* Period */}
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <div className="flex rounded-lg border p-0.5 bg-muted/40 max-w-full overflow-x-auto no-scrollbar">
          {(["month", "quarter", "year", "range"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => choose(m)} className={cn("px-3 h-8 text-sm rounded-md whitespace-nowrap shrink-0", mode === m ? "bg-background shadow-sm font-medium" : "text-muted-foreground")}>
              {ta(`mode_${m}`)}
            </button>
          ))}
        </div>
        {mode === "month" && (
          <Input type="month" value={from.slice(0, 7)} onChange={(e) => e.target.value && setRange(rangeOf("month", new Date(`${e.target.value}-01T12:00:00`)))} className="h-9 w-[170px]" />
        )}
        {mode === "quarter" && (
          <div className="flex items-center gap-1">
            <Input type="number" value={year} onChange={(e) => { const y = Number(e.target.value); if (y > 2000) setRange(rangeOf("quarter", new Date(y, new Date(`${from}T12:00:00`).getMonth(), 15))); }} className="h-9 w-[90px]" />
            {[1, 2, 3, 4].map((q) => {
              const r = rangeOf("quarter", new Date(year, (q - 1) * 3, 15));
              return (
                <button key={q} type="button" onClick={() => setRange(r)} className={cn("h-9 w-11 rounded-md border text-sm", from === r[0] ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}>
                  T{q}
                </button>
              );
            })}
          </div>
        )}
        {mode === "year" && (
          <Input type="number" value={year} onChange={(e) => { const y = Number(e.target.value); if (y > 2000) setRange(rangeOf("year", new Date(y, 5, 15))); }} className="h-9 w-[100px]" />
        )}
        {mode === "range" && (
          <>
            <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setRange([e.target.value, to])} className="h-9 w-[150px]" />
            <Input type="date" value={to} min={from} onChange={(e) => e.target.value && setRange([from, e.target.value])} className="h-9 w-[150px]" />
          </>
        )}
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mb-2.5" />}
      </div>

      {book?.clinicNifMissing && (
        <div className="rounded-xl border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm print:hidden">
          {t("clinicNifMissing")}{" "}
          <a href="/settings" className="underline font-medium">{t("openSettings")}</a>
        </div>
      )}

      {!!book?.pendingTickets && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 print:hidden">
          <p className="text-sm flex-1 min-w-[200px]">{t("pendingTickets", { count: book.pendingTickets })}</p>
          <Button size="sm" className="gap-1.5" disabled={isBusy} onClick={() => startBusy(async () => {
            const { issued } = await issuePendingTickets(from, to);
            toast.success(t("ticketsIssued", { count: issued }));
            load();
          })}>
            <FileCheck2 className="w-4 h-4" />
            {t("issueTicketsNow")}
          </Button>
        </div>
      )}

      {/* Hand over to the adviser */}
      <div className="rounded-xl border bg-card p-3 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold flex-1">{ta("forAdviser")}</p>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" className="accent-primary" checked={withInvoices} onChange={(e) => setWithInvoices(e.target.checked)} />
            {ta("includeInvoices")}
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!rows.length} onClick={() => window.open(fileUrl("pdf"), "_blank")}>
            <FileText className="w-4 h-4" />PDF
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!rows.length} onClick={() => (window.location.href = fileUrl("csv"))}>
            <Download className="w-4 h-4" />Excel (CSV)
          </Button>
          <Button size="sm" className="gap-1.5" disabled={!rows.length} onClick={() => setSendOpen((o) => !o)}>
            <Mail className="w-4 h-4" />{ta("sendByEmail")}
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={!rows.length || isBusy} onClick={markSent}>
            <CheckCircle2 className="w-4 h-4" />{ta("markSent")}
          </Button>
        </div>
        {sendOpen && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            {book && !book.emailReady && <p className="text-xs text-amber-700 dark:text-amber-400">{ta("err_emailNotConfigured")}</p>}
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={ta("adviserEmailPlaceholder")} />
            <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={ta("messagePlaceholder")} />
            <Button size="sm" className="gap-1.5" disabled={isBusy || !email.includes("@") || !book?.emailReady} onClick={send}>
              {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {ta("sendNow")}
            </Button>
          </div>
        )}
        {book && (
          <p className="text-xs text-muted-foreground">
            {rows.length === 0 ? ta("nothingIssued") : unsent === 0 ? ta("allSent") : ta("unsentCount", { count: unsent, total: rows.length })}
          </p>
        )}
        {!!book?.exports.length && (
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {book.exports.map((e) => (
              <li key={e.id}>
                ✓ {format(new Date(e.createdAt), "dd/MM/yyyy HH:mm")} · {ta(e.method === "EMAIL" ? "sentEmail" : "sentManual", { email: e.sentTo ?? "" })} · {format(new Date(e.periodFrom), "dd/MM")}–{format(new Date(e.periodTo), "dd/MM/yyyy")} · {e.docCount} · {e.by ?? ""}
              </li>
            ))}
          </ul>
        )}
      </div>

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
          <table className="w-full text-sm sm:min-w-[680px]">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">{t("docNumber")}</th>
                <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">{t("date")}</th>
                <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">{t("customerName")}</th>
                <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">{t("taxBase")}</th>
                <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">IVA</th>
                <th className="text-right font-medium px-3 py-2">{t("total")}</th>
                <th className="w-8 print:hidden" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className={cn(r.replacedBy && "text-muted-foreground")}>
                  <td className="px-3 py-2">
                    <span className={cn("font-mono whitespace-nowrap", r.replacedBy && "line-through")}>{r.docNumber}</span>
                    <p className="text-[11px] text-muted-foreground">
                      {t(kindLabel[r.kind])}
                      {r.replacedBy && ` · ${t("replacedBy", { doc: r.replacedBy })}`}
                      {r.rectifiedBy && !r.replacedBy && ` · ${t("rectifiedBy", { doc: r.rectifiedBy })}`}
                      {r.replaces && !r.replacedBy && ` · ${r.kind === "RECTIFYING" ? t("rectifiesDoc", { doc: r.replaces }) : t("replacesDoc", { doc: r.replaces })}`}
                    </p>
                    {/* On a phone date and base / VAT go here, so the table fits without scrolling sideways */}
                    <p className="sm:hidden text-xs">
                      {r.customerName}
                      {r.customerNif && <span className="text-muted-foreground"> · {r.customerNif}</span>}
                    </p>
                    <p className="sm:hidden text-[11px] text-muted-foreground">
                      {format(new Date(r.issuedAt), "dd/MM/yyyy")} · {t("taxBase")} {formatEur(r.taxBase)} · IVA {formatEur(r.taxAmount)}
                    </p>
                    {r.sentAt && (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">✓ {ta("sentOn", { date: format(new Date(r.sentAt), "dd/MM/yyyy") })}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap hidden sm:table-cell">{format(new Date(r.issuedAt), "dd/MM/yyyy")}</td>
                  <td className="px-3 py-2 hidden sm:table-cell">
                    {r.customerName}
                    {r.customerNif && <span className="text-xs text-muted-foreground"> · {r.customerNif}</span>}
                  </td>
                  <td className="px-3 py-2 text-right hidden sm:table-cell">{formatEur(r.taxBase)}</td>
                  <td className="px-3 py-2 text-right hidden sm:table-cell">{formatEur(r.taxAmount)}</td>
                  <td className={cn("px-3 py-2 text-right font-medium whitespace-nowrap align-top", r.total < 0 && "text-red-600")}>{formatEur(r.total)}</td>
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
      <p className="text-xs text-muted-foreground print:hidden">{t("bookHint")} {ta("sentHint")}</p>
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
