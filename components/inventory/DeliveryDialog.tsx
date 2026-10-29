"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardPaste, Loader2, Package, PackagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSuppliers, receiveDelivery } from "@/lib/actions/inventory";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/common/NumberInput";
import { ProductPicker } from "@/components/finances/ProductPicker";
import { TaxRateChips } from "@/components/finances/TaxRateChips";
import { INVENTORY_CATEGORIES, INVENTORY_UNITS, categoryLabel, unitLabel } from "@/lib/inventory-labels";
import { cents, formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";

type Line = {
  key: number;
  itemId: string | null;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  lot: string;
  expiryDate: string;
  unitCost: number;
  salePrice: number;
  taxRate: number;
  isNew: boolean;
};

let seq = 0;

// "dd/mm/yyyy", "mm/yyyy", "yyyy-mm" or "yyyy-mm-dd" from a supplier's sheet → yyyy-mm-dd
function parseDate(raw: string) {
  const v = raw.trim();
  let m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const last = new Date(Number(m[2]), Number(m[1]), 0).getDate();
    return `${m[2]}-${m[1].padStart(2, "0")}-${last}`;
  }
  m = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (m) return `${m[1]}-${m[2]}-${m[3] ?? new Date(Number(m[1]), Number(m[2]), 0).getDate()}`;
  return "";
}

const num = (v: string | undefined) => {
  const n = parseFloat((v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// Receive a supplier delivery in one go: find each product (or type a new one), then quantity, lot,
// expiry and price. Rows can also be pasted from Excel or the supplier's e-mail.
export function DeliveryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations("inventory");
  const tc = useTranslations("common");
  const router = useRouter();
  const [supplier, setSupplier] = useState("");
  const [document, setDocument] = useState("");
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [isSaving, startSave] = useTransition();

  useEffect(() => {
    if (!open) return;
    getSuppliers().then(setSuppliers);
    setLines([]);
    setSupplier("");
    setDocument("");
    setPasteOpen(false);
  }, [open]);

  const update = (key: number, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function addLine(base: Partial<Line> & { name: string }) {
    setLines((prev) => [
      ...prev,
      {
        key: ++seq,
        itemId: null,
        category: INVENTORY_CATEGORIES[0],
        unit: INVENTORY_UNITS[0],
        quantity: 1,
        lot: "",
        expiryDate: "",
        unitCost: 0,
        salePrice: 0,
        taxRate: 10,
        isNew: true,
        ...base,
      },
    ]);
  }

  // Columns: name; quantity; lot; expiry; cost (tab or semicolon separated)
  function importPasted() {
    const rows = pasteText.split(/\r?\n/).map((r) => r.split(/\t|;/)).filter((c) => c[0]?.trim());
    for (const c of rows) {
      addLine({
        name: c[0].trim(),
        quantity: num(c[1]) || 1,
        lot: (c[2] ?? "").trim(),
        expiryDate: parseDate(c[3] ?? ""),
        unitCost: num(c[4]),
      });
    }
    setPasteText("");
    setPasteOpen(false);
    if (rows.length) toast.success(t("pastedRows", { count: rows.length }));
  }

  const totalCost = cents(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));
  const valid = lines.length > 0 && lines.every((l) => l.name.trim() && l.quantity > 0);

  function save() {
    startSave(async () => {
      const result = await receiveDelivery({
        supplier,
        document,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          name: l.name,
          category: l.category,
          unit: l.unit,
          quantity: l.quantity,
          lot: l.lot,
          expiryDate: l.expiryDate,
          unitCost: l.unitCost || "",
          salePrice: l.salePrice || "",
          taxRate: l.taxRate,
        })),
      });
      if ("error" in result) { toast.error(t("errorSave")); return; }
      toast.success(t("deliveryReceived", { count: result.received, created: result.created }));
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackagePlus className="w-5 h-5 text-primary" />{t("deliveryTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("supplier")}</Label>
              <Input list="delivery-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Alvet Escartí" />
              <datalist id="delivery-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div className="space-y-1">
              <Label>{t("deliveryDocument")}</Label>
              <Input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="A-26077226" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-start">
            <ProductPicker
              className="flex-1 min-w-[240px]"
              allowNew
              placeholder={t("deliverySearch")}
              onPick={(p) => {
                if ("newName" in p) addLine({ name: p.newName });
                else
                  addLine({
                    itemId: p.id,
                    name: p.name,
                    category: p.category,
                    unit: p.unit,
                    unitCost: p.unitCost ?? 0,
                    salePrice: p.salePrice ?? 0,
                    taxRate: p.taxRate ?? 10,
                    isNew: false,
                  });
              }}
            />
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setPasteOpen((o) => !o)}>
              <ClipboardPaste className="w-4 h-4" />
              {t("pasteFromExcel")}
            </Button>
          </div>

          {pasteOpen && (
            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <p className="text-xs text-muted-foreground">{t("pasteHint")}</p>
              <Textarea rows={5} className="font-mono text-xs bg-background" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"APOQUEL 16mg 20comp\t1\t752083\t05/2027\t53,85"} />
              <Button type="button" size="sm" onClick={importPasted} disabled={!pasteText.trim()}>{t("addRows")}</Button>
            </div>
          )}

          {lines.length === 0 ? (
            <div className="text-center py-8 border border-dashed rounded-lg text-sm text-muted-foreground">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
              {t("deliveryEmpty")}
            </div>
          ) : (
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className={cn("rounded-lg border p-3 space-y-2", l.isNew && "border-primary/40 bg-primary/5")}>
                  <div className="flex items-center gap-2">
                    <Input className="h-8 font-medium flex-1" value={l.name} onChange={(e) => update(l.key, { name: e.target.value })} />
                    {l.isNew && <span className="text-[10px] font-semibold uppercase text-primary shrink-0">{t("newProduct")}</span>}
                    <button type="button" onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {l.isNew && (
                    <div className="grid grid-cols-2 gap-2">
                      <select className="h-8 rounded-md border bg-background px-2 text-sm" value={l.category} onChange={(e) => update(l.key, { category: e.target.value })}>
                        {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(t, c)}</option>)}
                      </select>
                      <select className="h-8 rounded-md border bg-background px-2 text-sm" value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })}>
                        {INVENTORY_UNITS.map((u) => <option key={u} value={u}>{unitLabel(t, u)}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <Field label={t("quantity")}>
                      <NumberInput className="h-8 text-sm" fallback={1} value={l.quantity} onValueChange={(v) => update(l.key, { quantity: Math.max(0, v) })} />
                    </Field>
                    <Field label={t("lot")}>
                      <Input className="h-8 text-sm" value={l.lot} onChange={(e) => update(l.key, { lot: e.target.value })} />
                    </Field>
                    <Field label={t("expiryDate")}>
                      <Input type="date" className="h-8 text-sm" value={l.expiryDate} onChange={(e) => update(l.key, { expiryDate: e.target.value })} />
                    </Field>
                    <Field label={t("costPerUnit")}>
                      <NumberInput className="h-8 text-sm" value={l.unitCost} onValueChange={(v) => update(l.key, { unitCost: Math.max(0, v) })} />
                    </Field>
                    <Field label={t("salePrice")}>
                      <NumberInput className="h-8 text-sm" value={l.salePrice} onValueChange={(v) => update(l.key, { salePrice: Math.max(0, v) })} />
                    </Field>
                  </div>
                  <TaxRateChips label={t("saleVat")} value={l.taxRate} onChange={(taxRate) => update(l.key, { taxRate })} />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">{t("deliveryCost", { count: lines.length })}</span>
            <span className="font-semibold">{formatEur(totalCost)}</span>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>{tc("cancel")}</Button>
            <Button className="flex-1" disabled={!valid || isSaving} onClick={save}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("receiveN", { count: lines.length })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
