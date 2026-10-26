"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileDown, FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EXPORTS = ["patients", "appointments", "medical_records", "vaccinations", "invoices", "inventory", "services"] as const;
const IMPORTS = ["patients", "inventory", "services"] as const;
type ImportEntity = (typeof IMPORTS)[number];

type Issue = { row: number; code: string; field?: string };
type ImportResult = {
  total: number;
  created: number;
  skipped: number;
  errors: Issue[];
  duplicates: Issue[];
  dryRun: boolean;
};

export function DataTransferPanel() {
  const t = useTranslations("dataTransfer");
  const router = useRouter();
  const [entity, setEntity] = useState<ImportEntity>("patients");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset(next?: ImportEntity) {
    if (next) setEntity(next);
    setFile(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/data/import/${entity}?dryRun=${dryRun ? 1 : 0}`, { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResult(json);
      if (!dryRun) {
        toast.success(t("imported", { count: json.created }));
        router.refresh();
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      toast.error(code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("importFailed"));
    } finally {
      setBusy(false);
    }
  }

  const issueText = (i: Issue) =>
    `${i.row > 0 ? t("rowN", { n: i.row }) + ": " : ""}${t.has(`errors.${i.code}`) ? t(`errors.${i.code}`) : i.code}${i.field ? ` (${i.field})` : ""}`;

  return (
    <div className="space-y-6">
      {/* Export */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <FileDown className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t("exportTitle")}</h2>
        </div>
        <p className="text-xs text-muted-foreground">{t("exportHint")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EXPORTS.map((e) => (
            <a
              key={e}
              href={`/api/data/export/${e}`}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
              <span>{t(`entities.${e}`)}</span>
              <Download className="w-4 h-4 text-muted-foreground" />
            </a>
          ))}
        </div>
        <a
          href="/api/data/export/backup"
          className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <span>{t("backup")}</span>
          <Download className="w-4 h-4" />
        </a>
        <p className="text-xs text-muted-foreground">{t("backupHint")}</p>
      </section>

      {/* Import */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <FileUp className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t("importTitle")}</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {IMPORTS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => reset(e)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                entity === e ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"
              )}
            >
              {t(`entities.${e}`)}
            </button>
          ))}
        </div>

        <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
          <li>
            {t("step1")}{" "}
            <a href={`/api/data/template/${entity}`} className="text-primary hover:underline">
              {t("downloadTemplate")}
            </a>
          </li>
          <li>{t(`step2.${entity}`)}</li>
          <li>{t("step3")}</li>
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            {file ? file.name : t("chooseFile")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!file || busy} onClick={() => run(true)}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("check")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-primary text-primary-foreground"
            disabled={!file || busy || !result?.dryRun || result.created === 0}
            onClick={() => run(false)}
          >
            {t("import")}
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
            <p className="flex items-center gap-2 font-medium">
              {result.errors.length === 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              )}
              {result.dryRun
                ? t("checkSummary", { total: result.total, created: result.created, skipped: result.skipped, errors: result.errors.length })
                : t("importSummary", { created: result.created, skipped: result.skipped, errors: result.errors.length })}
            </p>
            {result.dryRun && result.errors.length > 0 && result.created > 0 && (
              <p className="text-xs text-muted-foreground">{t("errorsSkipped")}</p>
            )}
            {[...result.errors, ...result.duplicates].length > 0 && (
              <ul className="max-h-48 overflow-y-auto text-xs space-y-0.5">
                {result.errors.map((i, n) => (
                  <li key={`e${n}`} className="text-destructive">{issueText(i)}</li>
                ))}
                {result.duplicates.map((i, n) => (
                  <li key={`d${n}`} className="text-muted-foreground">{issueText(i)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
