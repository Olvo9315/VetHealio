"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, CircleAlert, Plus } from "lucide-react";
import { examLabel, type ExamRow, type ExamStatus } from "@/lib/exam";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Physical exam as a quick checklist: tap "normal" or "abnormal" per system; a note field opens for
// anything abnormal. "All normal" marks every row that is still empty.
export function ExamChecklist({ rows, onChange }: { rows: ExamRow[]; onChange: (rows: ExamRow[]) => void }) {
  const t = useTranslations("medicalRecords");
  const filled = rows.filter((r) => r.status || r.note).length;
  const abnormal = rows.filter((r) => r.status === "abnormal").length;
  const [open, setOpen] = useState(filled > 0);
  const [custom, setCustom] = useState("");

  function update(idx: number, patch: Partial<ExamRow>) {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function toggle(idx: number, status: Exclude<ExamStatus, null>) {
    update(idx, { status: rows[idx].status === status ? null : status });
  }

  function addCustom() {
    const label = custom.trim();
    if (!label) return;
    onChange([...rows, { key: label, status: "abnormal", note: "" }]);
    setCustom("");
  }

  return (
    <div className="rounded-lg border border-border">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("examTitle")}</span>
        {filled > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("examSummary", { filled, total: rows.length })}
            {abnormal > 0 && <span className="text-amber-600 dark:text-amber-400"> · {t("examAbnormal", { count: abnormal })}</span>}
          </span>
        )}
        <ChevronDown className={cn("w-4 h-4 ml-auto text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2 space-y-1">
          <div className="flex justify-end pb-1">
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => onChange(rows.map((r) => (r.status ? r : { ...r, status: "normal" })))}
            >
              {t("examAllNormal")}
            </button>
          </div>
          {rows.map((row, idx) => (
            <div key={row.key} className="py-1">
              <div className="flex items-center gap-1.5">
                <span className="flex-1 text-sm min-w-0 truncate" title={examLabel(t, row.key)}>{examLabel(t, row.key)}</span>
                <button
                  type="button"
                  onClick={() => toggle(idx, "normal")}
                  title={t("examNormal")}
                  className={cn(
                    "h-7 px-2 rounded-md text-xs border flex items-center gap-1 transition-colors shrink-0",
                    row.status === "normal"
                      ? "bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-200"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("examNormal")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggle(idx, "abnormal")}
                  title={t("examAltered")}
                  className={cn(
                    "h-7 px-2 rounded-md text-xs border flex items-center gap-1 transition-colors shrink-0",
                    row.status === "abnormal"
                      ? "bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-200"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <CircleAlert className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("examAltered")}</span>
                </button>
              </div>
              {(row.status === "abnormal" || row.note) && (
                <Input
                  className="h-8 mt-1 text-sm"
                  placeholder={t("examNotePlaceholder")}
                  value={row.note}
                  onChange={(e) => update(idx, { note: e.target.value })}
                />
              )}
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Input
              className="h-8 text-sm"
              placeholder={t("examAddRow")}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            />
            <button type="button" onClick={addCustom} className="h-8 w-8 shrink-0 rounded-md border flex items-center justify-center hover:bg-muted">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
