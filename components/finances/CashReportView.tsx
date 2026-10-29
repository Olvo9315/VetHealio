"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight, Download, Loader2, Printer } from "lucide-react";
import { getCashReport, type CashReport } from "@/lib/actions/billing";
import { paymentLabel } from "@/lib/payment-methods";
import { downloadCsv, formatEur } from "@/lib/format";
import { useDateLocale } from "@/lib/date-locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatInvoiceId } from "@/lib/utils";

const DAY = "yyyy-MM-dd";

// Money taken on a day: totals by method and by employee, every payment, printable for closing the till
export function CashReportView() {
  const t = useTranslations("finances");
  const dateLocale = useDateLocale();
  const [day, setDay] = useState(() => format(new Date(), DAY));
  const [report, setReport] = useState<CashReport | null>(null);
  const [isLoading, startLoad] = useTransition();

  useEffect(() => {
    startLoad(async () => setReport(await getCashReport(day)));
  }, [day]);

  const shift = (n: number) => setDay(format(addDays(new Date(`${day}T12:00:00`), n), DAY));

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shift(-1)}><ChevronLeft className="w-4 h-4" /></Button>
        <Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-9 w-[160px]" />
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shift(1)}><ChevronRight className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setDay(format(new Date(), DAY))}>{t("today")}</Button>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!report?.payments.length}
            onClick={() =>
              report &&
              downloadCsv(`${t("cashFile")}_${day}`, [
                [t("time"), t("owner"), t("patient"), t("invoice"), t("paymentMethod"), t("receivedBy"), t("amount")],
                ...report.payments.map((p) => [
                  format(new Date(p.paidAt), "HH:mm"),
                  p.customer,
                  p.petName,
                  formatInvoiceId(p.billNumber, p.paidAt),
                  t(paymentLabel[p.method]),
                  p.receivedBy ?? "",
                  p.amount.toFixed(2),
                ]),
              ])
            }
          >
            <Download className="w-4 h-4" />
            Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            {t("printCash")}
          </Button>
        </div>
      </div>

      <h2 className="hidden print:block text-lg font-bold capitalize">
        {t("cashTitle")} · {format(new Date(`${day}T12:00:00`), "EEEE d MMMM yyyy", { locale: dateLocale })}
      </h2>

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="rounded-xl border bg-primary/5 border-primary/30 px-3 py-2.5 col-span-2 md:col-span-1">
              <p className="text-xs text-muted-foreground">{t("cashTotal")}</p>
              <p className="text-xl font-bold">{formatEur(report.total)}</p>
              <p className="text-[11px] text-muted-foreground">{t("paymentsCount", { count: report.payments.length })}</p>
            </div>
            {(["CASH", "CARD", "BIZUM", "TRANSFER"] as const).map((m) => {
              const row = report.byMethod.find((r) => r.method === m);
              return (
                <div key={m} className="rounded-xl border bg-card px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">{t(paymentLabel[m])}</p>
                  <p className="text-lg font-semibold">{formatEur(row?.amount ?? 0)}</p>
                  <p className="text-[11px] text-muted-foreground">{t("paymentsCount", { count: row?.count ?? 0 })}</p>
                </div>
              );
            })}
          </div>

          {report.byEmployee.length > 1 && (
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t("byEmployee")}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {report.byEmployee.map((e) => (
                  <span key={e.name}>{e.name}: <span className="font-semibold">{formatEur(e.amount)}</span> <span className="text-muted-foreground">({e.count})</span></span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card overflow-hidden">
            {report.payments.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10">{t("noPaymentsDay")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2 w-16">{t("time")}</th>
                    <th className="text-left font-medium px-3 py-2">{t("owner")}</th>
                    <th className="text-left font-medium px-3 py-2 hidden md:table-cell">{t("receivedBy")}</th>
                    <th className="text-left font-medium px-3 py-2">{t("paymentMethod")}</th>
                    <th className="text-right font-medium px-3 py-2">{t("amount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 text-muted-foreground">{format(new Date(p.paidAt), "HH:mm")}</td>
                      <td className="px-3 py-2">
                        <Link href={`/patients/${p.petId}`} className="hover:underline">{p.customer}</Link>
                        <span className="text-xs text-muted-foreground"> · {p.petName}</span>
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{p.receivedBy ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full bg-muted")}>{t(paymentLabel[p.method])}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatEur(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
