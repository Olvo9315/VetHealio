"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Download, Loader2, Search, Stethoscope } from "lucide-react";
import { getAppointmentList, type AppointmentListRow } from "@/lib/actions/appointments";
import type { AppointmentStatus } from "@prisma/client";
import { statusConfig } from "./AppointmentConfig";
import { useDateLocale } from "@/lib/date-locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SpeciesBadge } from "@/components/patients/SpeciesBadge";
import { cn, formatAppointmentId } from "@/lib/utils";
import { downloadCsv, formatEur } from "@/lib/format";

type Vet = { id: string; name: string };
type Preset = "today" | "week" | "month" | "lastMonth" | "custom";

const DAY = "yyyy-MM-dd";

function presetRange(preset: Exclude<Preset, "custom">): [string, string] {
  const now = new Date();
  const range: Record<typeof preset, [Date, Date]> = {
    today: [now, now],
    week: [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })],
    month: [startOfMonth(now), endOfMonth(now)],
    lastMonth: [startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1))],
  };
  const [a, b] = range[preset];
  return [format(a, DAY), format(b, DAY)];
}

// All appointments between two days (both included) with filters, totals and CSV export
export function AppointmentsList({ vets }: { vets: Vet[] }) {
  const t = useTranslations("appointments");
  const dateLocale = useDateLocale();
  const [preset, setPreset] = useState<Preset>("week");
  const [[from, to], setRange] = useState<[string, string]>(() => presetRange("week"));
  const [vetId, setVetId] = useState("all");
  const [status, setStatus] = useState<AppointmentStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AppointmentListRow[]>([]);
  const [isLoading, startLoad] = useTransition();

  useEffect(() => {
    if (!from || !to) return;
    const handle = setTimeout(() => {
      startLoad(async () => {
        setRows(
          await getAppointmentList({
            from: startOfDay(new Date(from)).toISOString(),
            to: endOfDay(new Date(to)).toISOString(),
            veterinarianId: vetId === "all" ? undefined : vetId,
            status: status === "all" ? undefined : status,
            search: search.trim() || undefined,
          })
        );
      });
    }, search ? 300 : 0);
    return () => clearTimeout(handle);
  }, [from, to, vetId, status, search]);

  function choosePreset(p: Exclude<Preset, "custom">) {
    setPreset(p);
    setRange(presetRange(p));
  }

  const totals = useMemo(() => {
    const done = rows.filter((r) => r.status === "COMPLETED").length;
    const missed = rows.filter((r) => r.status === "NO_SHOW" || r.status === "CANCELLED").length;
    const invoices = rows.map((r) => r.invoice).filter((i) => i && i.status !== "CANCELLED");
    const billed = invoices.reduce((s, i) => s + (i?.totalAmount ?? 0), 0);
    const paid = invoices.reduce((s, i) => s + (i?.paidAmount ?? 0), 0);
    return { count: rows.length, done, missed, billed, paid, unbilled: rows.filter((r) => !r.invoice && r.status === "COMPLETED").length };
  }, [rows]);

  function exportCsv() {
    downloadCsv(`${t("csvFile")}_${from}_${to}`, [
      [t("number"), t("date"), t("time"), t("patient"), t("owner"), t("ownerPhone"), t("services"), t("veterinarian"), t("status"), t("invoiceTotal"), t("paidAmount")],
      ...rows.map((r) => [
        formatAppointmentId(r.number),
        format(new Date(r.startTime), "dd/MM/yyyy"),
        format(new Date(r.startTime), "HH:mm"),
        r.pet.name,
        `${r.pet.owner.firstName} ${r.pet.owner.lastName}`,
        r.pet.owner.phone,
        r.services.join(", ") || r.title,
        r.veterinarian.name,
        t(statusConfig[r.status].label),
        r.invoice ? r.invoice.totalAmount.toFixed(2) : "",
        r.invoice ? r.invoice.paidAmount.toFixed(2) : "",
      ]),
    ]);
  }

  const presets: Exclude<Preset, "custom">[] = ["today", "week", "month", "lastMonth"];

  return (
    <div className="space-y-4">
      {/* Period */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex rounded-lg border p-0.5 bg-muted/40 max-w-full overflow-x-auto no-scrollbar">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => choosePreset(p)}
              className={cn(
                "px-3 h-8 text-sm rounded-md transition-colors whitespace-nowrap shrink-0",
                preset === p ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`preset_${p}`)}
            </button>
          ))}
        </div>
        <label className="flex flex-col text-xs text-muted-foreground gap-1">
          {t("from")}
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => { setPreset("custom"); setRange([e.target.value, to]); }}
            className="h-9 w-[150px]"
          />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground gap-1">
          {t("to")}
          <Input
            type="date"
            value={to}
            min={from}
            onChange={(e) => { setPreset("custom"); setRange([from, e.target.value]); }}
            className="h-9 w-[150px]"
          />
        </label>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("listSearch")} className="pl-9 h-9" />
        </div>
        <Select value={vetId} onValueChange={(v) => setVetId(v ?? "all")}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue>{vetId === "all" ? t("allVets") : vets.find((v) => v.id === vetId)?.name}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allVets")}</SelectItem>
            {vets.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus((v ?? "all") as AppointmentStatus | "all")}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue>{status === "all" ? t("allStatuses") : t(statusConfig[status].label)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            {(Object.keys(statusConfig) as AppointmentStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{t(statusConfig[s].label)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportCsv} disabled={!rows.length}>
          <Download className="w-4 h-4" />
          {t("exportCsv")}
        </Button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Total label={t("totalCount")} value={String(totals.count)} />
        <Total label={t("completed")} value={String(totals.done)} />
        <Total label={t("missed")} value={String(totals.missed)} />
        <Total label={t("billed")} value={formatEur(totals.billed)} hint={totals.unbilled ? t("unbilledHint", { count: totals.unbilled }) : undefined} />
        <Total label={t("collected")} value={formatEur(totals.paid)} />
      </div>

      {/* Rows */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading && !rows.length ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : !rows.length ? (
          <p className="text-center text-sm text-muted-foreground py-12">{t("noAppointments")}</p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[130px]">{t("date")}</TableHead>
                    <TableHead>{t("patient")}</TableHead>
                    <TableHead>{t("services")}</TableHead>
                    <TableHead>{t("veterinarian")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead className="text-right">{t("invoiceTotal")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={cn(isLoading && "opacity-60")}>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => (window.location.href = `/patients/${r.pet.id}?appointment=${r.id}`)}>
                      <TableCell className="whitespace-nowrap">
                        <span className="capitalize">{format(new Date(r.startTime), "EEE d MMM", { locale: dateLocale })}</span>
                        <span className="text-muted-foreground ml-1.5">{format(new Date(r.startTime), "HH:mm")}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <SpeciesBadge species={r.pet.species} />
                          <div className="min-w-0">
                            <p className="font-medium leading-tight">{r.pet.name}</p>
                            <p className="text-xs text-muted-foreground">{r.pet.owner.firstName} {r.pet.owner.lastName}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <p className="truncate">{r.services.join(", ") || r.title}</p>
                        {r.hasRecord && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1"><Stethoscope className="w-3 h-3" />{t("hasRecord")}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{r.veterinarian.name}</TableCell>
                      <TableCell>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusConfig[r.status].className)}>
                          {t(statusConfig[r.status].label)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <InvoiceCell row={r} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className={cn("md:hidden divide-y", isLoading && "opacity-60")}>
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/patients/${r.pet.id}?appointment=${r.id}`} className="flex items-start gap-3 p-3 active:bg-muted/50">
                    <div className="w-14 shrink-0 text-xs">
                      <p className="font-medium capitalize">{format(new Date(r.startTime), "EEE d", { locale: dateLocale })}</p>
                      <p className="text-muted-foreground">{format(new Date(r.startTime), "HH:mm")}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{r.pet.name} · <span className="font-normal text-muted-foreground">{r.pet.owner.firstName} {r.pet.owner.lastName}</span></p>
                      <p className="text-xs text-muted-foreground truncate">{r.services.join(", ") || r.title}</p>
                      <span className={cn("inline-block mt-1 text-[11px] px-1.5 py-0.5 rounded-full font-medium", statusConfig[r.status].className)}>
                        {t(statusConfig[r.status].label)}
                      </span>
                    </div>
                    <div className="text-right text-sm"><InvoiceCell row={r} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function InvoiceCell({ row }: { row: AppointmentListRow }) {
  const t = useTranslations("appointments");
  if (!row.invoice) return <span className="text-xs text-muted-foreground">{t("noInvoice")}</span>;
  const due = row.invoice.totalAmount - row.invoice.paidAmount;
  return (
    <div>
      <p className="font-medium">{formatEur(row.invoice.totalAmount)}</p>
      {row.invoice.status !== "CANCELLED" && due > 0.005 && (
        <p className="text-xs text-red-600 dark:text-red-400">{t("dueAmount", { amount: formatEur(due) })}</p>
      )}
    </div>
  );
}

function Total({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
      {hint && <p className="text-[11px] text-amber-600 dark:text-amber-400">{hint}</p>}
    </div>
  );
}
