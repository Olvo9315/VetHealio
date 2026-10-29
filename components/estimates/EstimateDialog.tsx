"use client";

import { memo, useCallback, useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { Ban, Check, FileText, Loader2, Mail, MessageCircle, Package, Plus, Printer, Receipt, RotateCcw, Trash2 } from "lucide-react";
import {
  billEstimate,
  deleteEstimate,
  getEstimateMessage,
  saveEstimate,
  setEstimateStatus,
  type EstimateFull,
} from "@/lib/actions/estimates";
import { getServicesFlat, type ServiceFlat } from "@/lib/actions/services";
import { getBillingDefaults } from "@/lib/actions/billing";
import { taxBreakdown } from "@/lib/billing";
import { estimateState, ESTIMATE_STATE_STYLE } from "@/lib/estimates";
import { ServicePicker } from "@/components/services/ServicePicker";
import { ServiceQuickAddDialog } from "@/components/services/ServiceQuickAddDialog";
import { ProductPicker } from "@/components/finances/ProductPicker";
import { TaxRateChips } from "@/components/finances/TaxRateChips";
import { NumberInput } from "@/components/common/NumberInput";
import { useCan } from "@/components/layout/PermissionsProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn, formatEstimateId } from "@/lib/utils";

type ItemType = "CONSULTATION" | "MEDICATION" | "SERVICE" | "OTHER";

type Line = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  type: ItemType;
  serviceId: string | null;
  inventoryItemId: string | null;
};

const LANGS = ["es", "ru", "en"] as const;
let _id = 0;
const nextId = () => `l${++_id}`;
const newLine = (taxRate: number): Line => ({ id: nextId(), description: "", quantity: 1, unitPrice: 0, taxRate, type: "SERVICE", serviceId: null, inventoryItemId: null });
const fmt = (v: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);

// Presupuesto: written before a treatment so the owner knows what it will cost. It is printed or sent
// to the owner, marked accepted / rejected, and once accepted turned into an albarán with the same lines.
export function EstimateDialog({
  open,
  onOpenChange,
  petId,
  petName,
  appointmentId,
  presetTitle,
  presetServiceIds,
  estimate,
  onSaved,
  onDeleted,
  onBilled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  petId: string;
  petName: string;
  appointmentId?: string;
  // A new estimate from a visit starts with its title and services (as the visit's albarán does)
  presetTitle?: string;
  presetServiceIds?: string[];
  estimate?: EstimateFull;
  onSaved?: (e: EstimateFull) => void;
  onDeleted?: (id: string) => void;
  // The albarán made from it, to open it
  onBilled?: (invoiceId: string) => void;
}) {
  const t = useTranslations("estimates");
  const tf = useTranslations("finances");
  const tc = useTranslations("common");
  const uiLocale = useLocale();
  const canWrite = useCan("invoice.write");
  const [current, setCurrent] = useState<EstimateFull | undefined>(estimate);
  const state = current ? estimateState(current) : null;
  const readOnly = !canWrite || state === "BILLED";

  const [title, setTitle] = useState("");
  const [validUntil, setValidUntil] = useState(() => format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [defaultTax, setDefaultTax] = useState(21);
  const [netPrices, setNetPrices] = useState(false);
  const [services, setServices] = useState<ServiceFlat[]>([]);
  const [productOpen, setProductOpen] = useState(false);
  const [quickAddRow, setQuickAddRow] = useState<string | null>(null);
  const [lang, setLang] = useState<string>(LANGS.includes(uiLocale as never) ? uiLocale : "es");
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    if (!open) return;
    setCurrent(estimate);
    setErrors({});
    setProductOpen(false);
    setTitle(estimate?.title ?? presetTitle ?? "");
    setNotes(estimate?.notes ?? "");
    setValidUntil(estimate ? format(new Date(estimate.validUntil), "yyyy-MM-dd") : format(addDays(new Date(), 30), "yyyy-MM-dd"));
    Promise.all([getServicesFlat(), getBillingDefaults()]).then(([svcs, { defaultTaxRate, pricesIncludeTax }]) => {
      setServices(svcs);
      setDefaultTax(defaultTaxRate);
      setNetPrices(!pricesIncludeTax);
      // Saved lines carry VAT: shown before VAT when the clinic prices that way
      setLines(
        estimate?.items.length
          ? estimate.items.map((i) => ({
              id: nextId(),
              description: i.description,
              quantity: i.quantity,
              unitPrice: pricesIncludeTax ? i.unitPrice : Math.round((i.unitPrice / (1 + i.taxRate / 100)) * 100) / 100,
              taxRate: i.taxRate,
              type: (i.type ?? "SERVICE") as ItemType,
              serviceId: i.serviceId,
              inventoryItemId: i.inventoryItemId,
            }))
          : presetLines(svcs, defaultTaxRate) ?? [newLine(defaultTaxRate)]
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, estimate]);

  // One line per service of the visit, named "Category › Service" in the clinic language, at its price
  function presetLines(svcs: ServiceFlat[], taxRate: number): Line[] | null {
    const found = (presetServiceIds ?? []).map((id) => svcs.find((s) => s.id === id)).filter((s): s is ServiceFlat => !!s);
    if (!found.length) return null;
    const path = (s: ServiceFlat) => {
      const parts: string[] = [];
      let cur: ServiceFlat | undefined = s;
      while (cur) {
        parts.unshift(cur.officialName ?? cur.name);
        cur = cur.parentId ? svcs.find((x) => x.id === cur!.parentId) : undefined;
      }
      return parts.join(" › ");
    };
    return found.map((s) => ({ ...newLine(taxRate), description: path(s), unitPrice: s.price ?? 0, serviceId: s.id }));
  }

  const update = useCallback((id: string, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    if (patch.description !== undefined) setErrors((e) => ({ ...e, [id]: false }));
  }, []);
  const remove = useCallback((id: string) => setLines((prev) => prev.filter((l) => l.id !== id)), []);

  const summary = taxBreakdown(
    lines.map((l) => {
      const unit = netPrices ? l.unitPrice * (1 + l.taxRate / 100) : l.unitPrice;
      return { description: "", quantity: l.quantity, unitPrice: unit, taxRate: l.taxRate, total: Math.round(l.quantity * unit * 100) / 100 };
    })
  );

  function validate() {
    const errs: Record<string, boolean> = {};
    if (!title.trim()) errs.title = true;
    lines.forEach((l) => { if (!l.description.trim()) errs[l.id] = true; });
    setErrors(errs);
    return !Object.values(errs).some(Boolean);
  }

  function save(after?: (e: EstimateFull) => void) {
    if (!validate()) return;
    startBusy(async () => {
      const r = await saveEstimate(current?.id ?? null, {
        petId,
        appointmentId: current ? current.appointmentId : appointmentId ?? null,
        title,
        notes,
        validUntil,
        items: lines.map(({ description, quantity, unitPrice, taxRate, type, serviceId, inventoryItemId }) => ({ description, quantity, unitPrice, taxRate, type, serviceId, inventoryItemId })),
      });
      if ("error" in r) { toast.error(t("errorSave")); return; }
      setCurrent(r.estimate);
      onSaved?.(r.estimate);
      if (after) after(r.estimate);
      else { toast.success(t("saved")); onOpenChange(false); }
    });
  }

  // Sending and printing use the saved version: save first when something changed
  function withSaved(fn: (e: EstimateFull) => void) {
    if (readOnly && current) return fn(current);
    save(fn);
  }

  function share(kind: "whatsapp" | "email") {
    withSaved((e) =>
      startBusy(async () => {
        const m = await getEstimateMessage(e.id, lang);
        if (!m) return;
        if (kind === "whatsapp") window.open(m.whatsapp ? `https://wa.me/${m.whatsapp}?text=${encodeURIComponent(m.text)}` : `https://wa.me/?text=${encodeURIComponent(m.text)}`, "_blank");
        else window.location.href = `mailto:${m.email ?? ""}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}`;
      })
    );
  }

  function print() {
    if (!readOnly && !validate()) return;
    // Opened inside the click (not blocked), pointed at the print once saved
    const w = window.open("about:blank", "_blank");
    withSaved((e) => { if (w) w.location.href = `/print/estimate/${e.id}?lang=${lang}`; });
  }

  function setStatus(status: "PENDING" | "ACCEPTED" | "REJECTED") {
    if (!current) return;
    startBusy(async () => {
      const r = await setEstimateStatus(current.id, status);
      if ("error" in r) { toast.error(t("errorSave")); return; }
      setCurrent(r.estimate);
      onSaved?.(r.estimate);
      toast.success(t(`toast_${status}`));
    });
  }

  function bill() {
    withSaved((e) => {
      if (!confirm(t("billConfirm", { total: fmt(e.total) }))) return;
      startBusy(async () => {
        const r = await billEstimate(e.id);
        if ("error" in r) { toast.error(t("errorSave")); return; }
        toast.success(t("billed"));
        onOpenChange(false);
        onBilled?.(r.invoiceId);
      });
    });
  }

  function remove_() {
    if (!current || !confirm(t("deleteConfirm"))) return;
    startBusy(async () => {
      const r = await deleteEstimate(current.id);
      if ("error" in r) { toast.error(t("errorSave")); return; }
      toast.success(t("deleted"));
      onDeleted?.(current.id);
      onOpenChange(false);
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {current ? `${t("estimate")} ${formatEstimateId(current.number)}` : t("new")}
              {state && <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", ESTIMATE_STATE_STYLE[state])}>{t(`state_${state}`)}</span>}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 min-w-0">
            <div className="px-3 py-2 rounded-lg bg-muted text-sm">
              <span className="text-muted-foreground">{tf("patient")}: </span>
              <span className="font-medium">{petName}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
              <div className="space-y-1.5">
                <Label>{t("title")} *</Label>
                <Input value={title} disabled={readOnly} onChange={(e) => { setTitle(e.target.value); setErrors((x) => ({ ...x, title: false })); }} placeholder={t("titlePlaceholder")} className={cn(errors.title && "border-destructive")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("validUntil")}</Label>
                <Input type="date" value={validUntil} disabled={readOnly} onChange={(e) => e.target.value && setValidUntil(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{tf("lineItems")}</p>
                {!readOnly && (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setProductOpen((o) => !o)}>
                      <Package className="w-3.5 h-3.5 mr-1" />{tf("addProduct")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setLines((p) => [...p, newLine(defaultTax)])}>
                      <Plus className="w-3.5 h-3.5 mr-1" />{tf("addItem")}
                    </Button>
                  </div>
                )}
              </div>
              {productOpen && (
                <ProductPicker
                  autoFocus
                  onPick={(p) => {
                    if ("newName" in p) return;
                    setLines((prev) => {
                      const base = prev.length === 1 && !prev[0].description && !prev[0].unitPrice ? [] : prev;
                      return [...base, { id: nextId(), description: p.name, quantity: 1, unitPrice: p.salePrice ?? 0, taxRate: p.taxRate ?? defaultTax, type: "MEDICATION", serviceId: null, inventoryItemId: p.id }];
                    });
                    setProductOpen(false);
                  }}
                />
              )}
              {lines.map((l, idx) => (
                <LineRow
                  key={l.id}
                  idx={idx}
                  line={l}
                  services={services}
                  netPrices={netPrices}
                  readOnly={readOnly}
                  isOnly={lines.length === 1}
                  error={!!errors[l.id]}
                  onUpdate={update}
                  onRemove={remove}
                  onAddNewService={setQuickAddRow}
                />
              ))}
              <div className="pt-1 border-t border-border space-y-0.5">
                <div className="flex justify-between text-xs text-muted-foreground"><span>{tf("taxBase")}</span><span>{fmt(summary.base)}</span></div>
                {summary.rows.filter((r) => r.tax).map((r) => (
                  <div key={r.rate} className="flex justify-between text-xs text-muted-foreground"><span>{tf("vatShort", { rate: r.rate })}</span><span>{fmt(r.tax)}</span></div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium"><Receipt className="w-4 h-4 text-muted-foreground" />{tf("total")}</span>
                  <span className="text-xl font-bold text-primary">{fmt(summary.total)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("notes")}</Label>
              <Textarea rows={3} value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} placeholder={t("notesPlaceholder")} />
            </div>

            {/* Give it to the owner */}
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground flex-1 min-w-0">{t("shareHint")}</p>
                {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                <div className="flex rounded-md border bg-background p-0.5">
                  {LANGS.map((l) => (
                    <button key={l} type="button" onClick={() => setLang(l)} className={cn("px-1.5 h-6 text-[11px] font-medium rounded", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 [&>button]:min-w-0">
                <Button type="button" variant="outline" size="sm" className="gap-1.5 bg-background" disabled={busy} onClick={print}><Printer className="w-4 h-4 shrink-0" /><span className="truncate">{t("print")}</span></Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5 bg-background" disabled={busy} onClick={() => share("whatsapp")}><MessageCircle className="w-4 h-4 shrink-0" /><span className="truncate">WhatsApp</span></Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5 bg-background" disabled={busy} onClick={() => share("email")}><Mail className="w-4 h-4 shrink-0" /><span className="truncate">Email</span></Button>
              </div>
            </div>

            {/* The owner's answer */}
            {current && canWrite && state !== "BILLED" && (
              <div className="flex flex-wrap gap-2">
                {state !== "ACCEPTED" && (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => setStatus("ACCEPTED")}>
                    <Check className="w-4 h-4 text-emerald-600" />{t("accept")}
                  </Button>
                )}
                {state !== "REJECTED" && (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => setStatus("REJECTED")}>
                    <Ban className="w-4 h-4 text-muted-foreground" />{t("reject")}
                  </Button>
                )}
                {(state === "ACCEPTED" || state === "REJECTED") && (
                  <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={busy} onClick={() => setStatus("PENDING")}>
                    <RotateCcw className="w-4 h-4" />{t("reopen")}
                  </Button>
                )}
                <Button type="button" size="sm" className="gap-1.5 ml-auto" disabled={busy || state === "REJECTED"} onClick={bill}>
                  <Receipt className="w-4 h-4" />{t("bill")}
                </Button>
              </div>
            )}
            {state === "BILLED" && current?.invoice && (
              <button type="button" onClick={() => { onOpenChange(false); onBilled?.(current.invoice!.id); }} className="w-full text-left rounded-lg border px-3 py-2 text-sm hover:bg-muted/40">
                {t("billedAs")}
              </button>
            )}

            <div className="flex gap-2 pt-1">
              {current && canWrite && state !== "BILLED" && (
                <Button type="button" variant="outline" size="icon" className="shrink-0 text-destructive" disabled={busy} onClick={remove_} title={t("delete")}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>{readOnly ? t("close") : tc("cancel")}</Button>
              {!readOnly && (
                <Button type="button" className="flex-1" disabled={busy} onClick={() => save()}>
                  {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {current ? tc("saveChanges") : t("create")}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ServiceQuickAddDialog
        open={!!quickAddRow}
        onOpenChange={(v) => !v && setQuickAddRow(null)}
        services={services}
        onCreated={(svc) => {
          setServices((prev) => [...prev, { id: svc.id, name: svc.name, price: svc.price, color: null, isActive: true, sortOrder: 0, parentId: null }]);
          if (quickAddRow) {
            setLines((prev) => prev.map((l) => (l.id === quickAddRow ? { ...l, serviceId: svc.id, description: svc.officialName ?? svc.name, unitPrice: l.unitPrice || svc.price || 0 } : l)));
          }
          setQuickAddRow(null);
        }}
      />
    </>
  );
}

const LineRow = memo(function LineRow({
  idx,
  line,
  services,
  netPrices,
  readOnly,
  isOnly,
  error,
  onUpdate,
  onRemove,
  onAddNewService,
}: {
  idx: number;
  line: Line;
  services: ServiceFlat[];
  netPrices: boolean;
  readOnly: boolean;
  isOnly: boolean;
  error: boolean;
  onUpdate: (id: string, patch: Partial<Line>) => void;
  onRemove: (id: string) => void;
  onAddNewService: (id: string) => void;
}) {
  const t = useTranslations("finances");
  const tc = useTranslations("common");
  const lineTotal = line.quantity * line.unitPrice * (netPrices ? 1 + line.taxRate / 100 : 1);

  return (
    <div className="border border-border rounded-lg p-3 space-y-2.5 bg-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{t("item")} {idx + 1}</span>
        <div className="flex items-center gap-2">
          {lineTotal > 0 && <span className="text-xs font-semibold text-primary">{fmt(lineTotal)}</span>}
          {!readOnly && (
            <button type="button" onClick={() => onRemove(line.id)} disabled={isOnly} className="text-muted-foreground hover:text-destructive disabled:opacity-30">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {line.inventoryItemId ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Package className="w-3.5 h-3.5" />{t("fromStockEstimate")}</p>
      ) : (
        !readOnly && (
          <ServicePicker
            services={services}
            value={line.serviceId}
            onChange={(svc) =>
              onUpdate(line.id, svc ? { serviceId: svc.id, description: svc.officialName ?? svc.name, unitPrice: line.unitPrice === 0 && svc.price != null ? svc.price : line.unitPrice } : { serviceId: null })
            }
            onAddNew={() => onAddNewService(line.id)}
            compact
          />
        )
      )}
      <div>
        <Input placeholder={`${t("description")} *`} value={line.description} disabled={readOnly} onChange={(e) => onUpdate(line.id, { description: e.target.value })} className={cn(error && "border-destructive")} />
        {error && <p className="text-xs text-destructive mt-0.5">{tc("required")}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("quantityShort")}</Label>
          <NumberInput integer fallback={1} className="h-8 text-sm" disabled={readOnly} value={line.quantity} onValueChange={(v) => onUpdate(line.id, { quantity: Math.max(1, v) })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{netPrices ? t("unitPriceNet") : t("unitPriceGross")}</Label>
          <NumberInput className="h-8 text-sm" disabled={readOnly} value={line.unitPrice} onValueChange={(v) => onUpdate(line.id, { unitPrice: Math.max(0, v) })} />
        </div>
      </div>
      {!readOnly && <TaxRateChips label={t("vat")} value={line.taxRate} onChange={(taxRate) => onUpdate(line.id, { taxRate })} />}
    </div>
  );
});
