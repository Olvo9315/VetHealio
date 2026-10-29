"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { endOfMonth, format, startOfMonth, subDays } from "date-fns";
import { AlertTriangle, CheckCircle2, Download, FlaskConical, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { getPresvetRows, markPresvetSent, type PresvetRow } from "@/lib/actions/presvet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadCsv } from "@/lib/format";
import { cn, formatPrescriptionId } from "@/lib/utils";

const DAY = "yyyy-MM-dd";

// Antibiotic prescriptions to report to PRESVET. Shows what is ready and what still lacks data,
// exports the file and keeps track of what was reported. Sending straight to PRESVET is not switched
// on yet (test mode): it needs the clinic's digital certificate and access to the region's service.
export function PresvetView() {
  const t = useTranslations("presvet");
  const tp = useTranslations("patients");
  // PRESVET asks for reports at least every two weeks: start with the last 15 days
  const [from, setFrom] = useState(() => format(subDays(new Date(), 14), DAY));
  const [to, setTo] = useState(() => format(new Date(), DAY));
  const [onlyPending, setOnlyPending] = useState(true);
  const [rows, setRows] = useState<PresvetRow[]>([]);
  const [province, setProvince] = useState<string | null>(null);
  const [isLoading, startLoad] = useTransition();
  const [isBusy, startBusy] = useTransition();

  const load = () => startLoad(async () => {
    const r = await getPresvetRows(from, to, onlyPending);
    setRows(r.rows);
    setProvince(r.clinicProvince);
  });
  useEffect(() => { if (from && to && from <= to) load(); }, [from, to, onlyPending]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = rows.filter((r) => !r.missing.length && r.status !== "SENT");
  const incomplete = rows.filter((r) => r.missing.length && r.status !== "SENT");

  function exportFile() {
    downloadCsv(`presvet_${from}_${to}`, [
      [t("col_number"), t("col_date"), t("col_vet"), t("col_license"), t("col_province"), t("col_species"), t("col_chip"), t("col_owner"), "NIF",
        t("field_nationalCode"), t("col_medication"), t("field_activeIngredient"), t("field_packages"), t("field_treatmentDays"), t("field_route"),
        t("field_purpose"), t("col_type"), t("col_posology")],
      ...rows.filter((r) => r.status !== "SENT").map((r) => [
        formatPrescriptionId(r.number),
        format(new Date(r.date), "dd/MM/yyyy"),
        r.vetName,
        r.vetLicense ?? "",
        province ?? "",
        r.species ? tp(r.species.toLowerCase()) : "",
        r.chip ?? "",
        r.ownerName,
        r.ownerNif ?? "",
        r.nationalCode ?? "",
        r.medication,
        r.activeIngredient ?? "",
        r.packages ?? "",
        r.treatmentDays ?? "",
        r.route ? t(`route_${r.route}`) : "",
        r.purpose ? t(`purpose_${r.purpose}`) : "",
        r.exceptional ? t("typeExceptional") : t("typeOrdinary"),
        r.posology,
      ]),
    ]);
  }

  function markSent() {
    const ids = Array.from(new Set(ready.map((r) => r.prescriptionId)));
    if (!ids.length || !confirm(t("markSentConfirm", { count: ids.length }))) return;
    startBusy(async () => {
      await markPresvetSent(ids, `manual ${format(new Date(), "dd/MM/yyyy")}`);
      toast.success(t("markedSent"));
      load();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30 p-3 text-sm">
        <FlaskConical className="w-5 h-5 text-sky-700 dark:text-sky-300 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">{t("testModeTitle")}</p>
          <p className="text-muted-foreground">{t("testModeText")}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-muted-foreground gap-1">
          {t("from")}
          <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-9 w-[150px]" />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground gap-1">
          {t("to")}
          <Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-9 w-[150px]" />
        </label>
        <Button variant="ghost" size="sm" onClick={() => { setFrom(format(startOfMonth(new Date()), DAY)); setTo(format(endOfMonth(new Date()), DAY)); }}>{t("thisMonth")}</Button>
        <label className="flex items-center gap-1.5 text-sm ml-auto cursor-pointer">
          <input type="checkbox" className="accent-primary" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
          {t("onlyPending")}
        </label>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {!province && (
        <p className="rounded-lg border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-sm">
          {t("noProvince")} <a href="/settings" className="underline">{t("openSettings")}</a>
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("statReady")} value={ready.length} tone="ok" />
        <Stat label={t("statIncomplete")} value={incomplete.length} tone={incomplete.length ? "warn" : undefined} />
        <Stat label={t("statSent")} value={rows.filter((r) => r.status === "SENT").length} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!rows.length} onClick={exportFile}>
          <Download className="w-4 h-4" />{t("exportFile")}
        </Button>
        <Button size="sm" className="gap-1.5" disabled title={t("sendDisabled")}>
          <Send className="w-4 h-4" />{t("sendNow")}
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5" disabled={!ready.length || isBusy} onClick={markSent}>
          <CheckCircle2 className="w-4 h-4" />{t("markSent")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">{t("sendDisabled")}</p>

      <div className="rounded-xl border bg-card divide-y">
        {!rows.length && <p className="text-sm text-muted-foreground text-center py-10">{t("empty")}</p>}
        {rows.map((r, i) => (
          <div key={`${r.prescriptionId}-${i}`} className="p-3 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{formatPrescriptionId(r.number)}</span>
              <span className="text-xs text-muted-foreground">{format(new Date(r.date), "dd/MM/yyyy")}</span>
              <span className="font-medium text-sm">{r.medication}</span>
              <span
                className={cn(
                  "ml-auto text-[11px] px-2 py-0.5 rounded-full font-medium",
                  r.status === "SENT"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                    : r.missing.length
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                )}
              >
                {r.status === "SENT" ? t("statusSent") : r.missing.length ? t("statusIncomplete") : r.status === "CHANGED" ? t("statusChanged") : t("statusReady")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {r.petId ? <Link href={`/patients/${r.petId}`} className="hover:underline">{r.petName}</Link> : r.petName}
              {r.species && ` (${tp(r.species.toLowerCase())})`} · {r.ownerName} · {r.vetName}
              {r.nationalCode && ` · CN ${r.nationalCode}`}
              {r.packages ? ` · ${t("packagesShort", { n: r.packages })}` : ""}
              {r.treatmentDays ? ` · ${t("daysShort", { n: r.treatmentDays })}` : ""}
              {r.purpose && ` · ${t(`purpose_${r.purpose}`)}`}
              {r.exceptional && ` · ${t("typeExceptional")}`}
            </p>
            {r.missing.length > 0 && r.status !== "SENT" && (
              <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                {t("missing")}: {r.missing.map((m) => t(`field_${m}`)).join(", ")}
              </p>
            )}
            {r.sentAt && <p className="text-xs text-emerald-700 dark:text-emerald-400">✓ {t("sentOn", { date: format(new Date(r.sentAt), "dd/MM/yyyy") })}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", tone === "ok" && "bg-sky-50/60 dark:bg-sky-950/20", tone === "warn" && "bg-amber-50/60 dark:bg-amber-950/20")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
