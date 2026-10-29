"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Circle, Copy, FlaskConical, Link2, Loader2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { getVerifactuRecord, getVerifactuStatus, setVerifactuQr, type VerifactuStatus } from "@/lib/actions/verifactu";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type RecordDetail = NonNullable<Awaited<ReturnType<typeof getVerifactuRecord>>>;

// VeriFactu: each ticket / invoice already gets its chained record, XML and QR. What is still needed
// to send them to the AEAT is listed here; sending stays off until then.
export function VerifactuView() {
  const t = useTranslations("verifactu");
  const [status, setStatus] = useState<VerifactuStatus | null>(null);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [, startLoad] = useTransition();
  const [busy, startBusy] = useTransition();

  useEffect(() => { startLoad(async () => setStatus(await getVerifactuStatus())); }, []);

  if (!status) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  const steps: { done: boolean; label: string; hint: string }[] = [
    { done: true, label: t("stepRecords"), hint: t("stepRecordsHint") },
    { done: !!status.clinicNif && !!status.legalName, label: t("stepClinic"), hint: t("stepClinicHint") },
    { done: status.producerReady, label: t("stepProducer"), hint: t("stepProducerHint") },
    { done: false, label: t("stepCertificate"), hint: t("stepCertificateHint") },
    { done: false, label: t("stepTest"), hint: t("stepTestHint") },
    { done: false, label: t("stepSend"), hint: t("stepSendHint") },
  ];

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start gap-3 rounded-xl border border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30 p-3 text-sm">
        <FlaskConical className="w-5 h-5 text-sky-700 dark:text-sky-300 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">{t("prepTitle")}</p>
          <p className="text-muted-foreground">{t("prepText")}</p>
        </div>
      </div>

      {status.unchained > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-sm">
          {t("unchained", { count: status.unchained })} <a href="/settings" className="underline">{t("openSettings")}</a>
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Stat label={t("statRecords")} value={String(status.total)} />
        <Stat label={t("statPending")} value={String(status.pending)} />
        <div className={cn("rounded-xl border px-3 py-2.5 flex items-center gap-2", status.chain.ok ? "bg-emerald-50/60 dark:bg-emerald-950/20" : "bg-red-50 dark:bg-red-950/30 border-red-300")}>
          {status.chain.ok ? <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" /> : <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />}
          <div>
            <p className="text-xs text-muted-foreground">{t("statChain")}</p>
            <p className="text-sm font-semibold">{status.chain.ok ? t("chainOk") : t("chainBroken", { seq: status.chain.brokenAt })}</p>
          </div>
        </div>
      </div>

      <section className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">{t("setupTitle")}</h3>
        <ol className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <Circle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className={cn("font-medium", s.done && "text-muted-foreground")}>{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.hint}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border bg-card p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{t("qrTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("qrHint")}</p>
        </div>
        <Switch
          checked={status.qrOnPrint}
          disabled={busy}
          onCheckedChange={(v) =>
            startBusy(async () => {
              await setVerifactuQr(v);
              setStatus((s) => (s ? { ...s, qrOnPrint: v } : s));
              toast.success(v ? t("qrOn") : t("qrOff"));
            })
          }
        />
      </section>

      <section className="rounded-xl border bg-card divide-y">
        <h3 className="text-sm font-semibold px-4 py-3">{t("recordsTitle")}</h3>
        {!status.rows.length && <p className="text-sm text-muted-foreground text-center py-8">{t("empty")}</p>}
        {status.rows.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={busy}
            onClick={() => startBusy(async () => setDetail(await getVerifactuRecord(r.id)))}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40"
          >
            <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">#{r.seq}</span>
            <span className="font-medium shrink-0">{r.numSerie}</span>
            <span className="text-xs rounded bg-muted px-1.5 py-0.5 shrink-0" title={t(`type_${r.invoiceType}`)}>{r.invoiceType}</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">{r.issueDate}</span>
            <span className="font-mono text-[11px] text-muted-foreground truncate flex-1 min-w-0 hidden md:inline">{r.hash}</span>
            <span className="ml-auto font-medium shrink-0">{r.totalAmount.replace(".", ",")} €</span>
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0", r.status === "PENDING" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200")}>
              {t(`status_${r.status}`)}
            </span>
          </button>
        ))}
      </section>

      {detail && (
        <Dialog open onOpenChange={(v) => !v && setDetail(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <DialogHeader>
              <DialogTitle>{detail.numSerie} · {t(`type_${detail.invoiceType}`)}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col sm:flex-row gap-4 min-w-0">
              <div className="shrink-0 space-y-1 text-center">
                <div className="w-36 h-36 mx-auto bg-white p-1.5 rounded [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: detail.qrSvg }} />
                <p className="text-[11px] font-bold tracking-wide">VERI*FACTU</p>
              </div>
              <dl className="text-sm space-y-1.5 min-w-0 flex-1">
                <Field label={t("fieldGenerated")} value={detail.generatedAt} />
                <Field label={t("fieldPrevHash")} value={detail.prevHash ?? t("firstRecord")} mono />
                <Field label={t("fieldHash")} value={detail.hash} mono />
                <a href={detail.qrUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Link2 className="w-3.5 h-3.5" />{t("qrLink")}
                </a>
              </dl>
            </div>
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{t("xmlTitle")}</p>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => navigator.clipboard.writeText(detail.xml).then(() => toast.success(t("copied")))}>
                  <Copy className="w-3.5 h-3.5" />{t("copy")}
                </Button>
              </div>
              <pre className="text-[11px] bg-muted rounded-lg p-3 overflow-x-auto max-h-72 whitespace-pre">{prettyXml(detail.xml)}</pre>
            </div>
            <Button variant="outline" onClick={() => setDetail(null)} className="gap-1.5"><X className="w-4 h-4" />{t("close")}</Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function prettyXml(xml: string) {
  let depth = 0;
  return xml
    .replace(/></g, ">\n<")
    // Keep empty elements on one line
    .replace(/(<sum1:(\w+)[^>]*>)\n(<\/sum1:\2>)/g, "$1$3")
    .split("\n")
    .map((line) => {
      if (line.startsWith("</")) depth--;
      const out = "  ".repeat(Math.max(0, depth)) + line;
      if (!line.startsWith("</") && !line.includes("</") && !line.endsWith("/>")) depth++;
      return out;
    })
    .join("\n");
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("break-all", mono && "font-mono text-[11px]")}>{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
