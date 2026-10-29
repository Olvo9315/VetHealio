"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { bindField } from "@/lib/form-field";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import type { InventoryItem } from "@/lib/actions/inventory";
import { createInventoryItem, updateInventoryItem, type ItemSuggestion } from "@/lib/actions/inventory";
import { getBillingDefaults } from "@/lib/actions/billing";
import { TaxRateChips } from "@/components/finances/TaxRateChips";
import { ItemNameInput } from "./ItemNameInput";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { translateMessage } from "@/lib/i18n-messages";
import { categoryLabel, unitLabel } from "@/lib/inventory-labels";

export const CATEGORIES = [
  "Medicamentos",
  "Vacunas",
  "Material quirúrgico",
  "Desinfectantes",
  "Alimentación",
  "Suplementos",
  "Equipamiento",
  "Otros",
] as const;

export const UNITS = [
  "unidades",
  "comprimidos",
  "viales",
  "ml",
  "mg",
  "g",
  "kg",
  "jeringas",
  "cajas",
  "bolsas",
  "litros",
] as const;

const schema = z.object({
  name: z.string().min(1, "required").max(100),
  category: z.string().min(1, "required"),
  quantity: z.coerce.number().min(0, "nonNegative"),
  unit: z.string().min(1, "required"),
  minStock: z.coerce.number().min(0).default(0),
  unitCost: z.coerce.number().positive().optional().or(z.literal("")),
  expiryDate: z.string().optional().or(z.literal("")),
  supplier: z.string().max(100).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
  barcode: z.string().max(50).optional().or(z.literal("")),
  salePrice: z.coerce.number().positive().optional().or(z.literal("")),
  taxRate: z.coerce.number().min(0).max(30).optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

interface InventoryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: InventoryItem;
  onSaved: (item: InventoryItem) => void;
  // A suggestion that is already in stock: open that item instead of creating a duplicate
  onOpenExisting?: (id: string) => void;
}

export function InventoryDialog({ open, onOpenChange, item, onSaved, onOpenExisting }: InventoryDialogProps) {
  const isEdit = !!item;
  const t = useTranslations("inventory");
  const tc = useTranslations("common");
  const tv = useTranslations("validation");
  const [isSaving, startSave] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: item
      ? {
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unit: item.unit,
          minStock: item.minStock,
          unitCost: item.unitCost ?? "",
          expiryDate: item.expiryDate ? format(new Date(item.expiryDate), "yyyy-MM-dd") : "",
          supplier: item.supplier ?? "",
          notes: item.notes ?? "",
          barcode: item.barcode ?? "",
          salePrice: item.salePrice ?? "",
          taxRate: item.taxRate ?? "",
        }
      : {
          name: "",
          category: "Medicamentos",
          quantity: 0,
          unit: "unidades",
          minStock: 0,
          unitCost: "",
          expiryDate: "",
          supplier: "",
          notes: "",
          barcode: "",
          salePrice: "",
          taxRate: "",
        },
  });

  // A picked suggestion that is already in stock (shown as a warning with a link to it)
  const [existing, setExisting] = useState<ItemSuggestion | null>(null);
  const [pricesIncludeTax, setPricesIncludeTax] = useState(true);
  const [defaultTax, setDefaultTax] = useState(21);
  useEffect(() => {
    if (!open) return;
    setExisting(null);
    // A new item always starts empty (the dialog stays mounted between uses)
    if (!isEdit) {
      form.reset({ name: "", category: "Medicamentos", quantity: 0, unit: "unidades", minStock: 0, unitCost: "", expiryDate: "", supplier: "", notes: "", barcode: "", salePrice: "", taxRate: "" });
    }
    getBillingDefaults().then((d) => { setPricesIncludeTax(d.pricesIncludeTax); setDefaultTax(d.defaultTaxRate); });
  }, [open, isEdit, form]);

  // Copies what is known about the picked product into the empty fields of the form
  function applySuggestion(sg: ItemSuggestion) {
    const set = (k: keyof FormData, v: unknown) => form.setValue(k, v as never, { shouldDirty: true });
    set("name", sg.name);
    if (sg.category) set("category", sg.category);
    if (sg.unit) set("unit", sg.unit);
    if (sg.unitCost != null) set("unitCost", sg.unitCost);
    if (sg.supplier) set("supplier", sg.supplier);
    if (sg.barcode) set("barcode", sg.barcode);
    if (sg.taxRate != null) set("taxRate", sg.taxRate);
    if (sg.salePrice != null) {
      // Bills keep prices with VAT; a clinic that prices before VAT sees it without
      const net = sg.source === "bill" && !pricesIncludeTax ? sg.salePrice / (1 + (sg.taxRate ?? defaultTax) / 100) : sg.salePrice;
      set("salePrice", Math.round(net * 100) / 100);
    }
    setExisting(sg.source === "stock" ? sg : null);
  }

  const watchCategory = form.watch("category");
  const watchUnit = form.watch("unit");
  const watchName = form.watch("name");
  const watchTax = form.watch("taxRate");

  async function handleSubmit(data: FormData) {
    startSave(async () => {
      if (isEdit) {
        const result = await updateInventoryItem(item.id, data);
        if ("error" in result) { toast.error(t("errorUpdate")); return; }
        toast.success(t("updated"));
        onSaved(result.item);
      } else {
        const result = await createInventoryItem(data);
        if ("error" in result) { toast.error(t("errorCreate")); return; }
        toast.success(t("created"));
        onSaved(result.item);
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("edit") : t("new")}</DialogTitle>
        </DialogHeader>

        <form
          ref={formRef}
          className="space-y-4 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (formRef.current) {
              formRef.current
                .querySelectorAll<HTMLInputElement>("input[name], textarea[name]")
                .forEach((el) => {
                  if (el.value) {
                    form.setValue(el.name as keyof FormData, el.value, { shouldDirty: true });
                  }
                });
            }
            (form.handleSubmit(handleSubmit as Parameters<typeof form.handleSubmit>[0]))();
          }}
        >
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("name")} *</Label>
            {isEdit ? (
              <Input id="name" placeholder={t("namePlaceholder")} {...bindField(form, "name")} />
            ) : (
              <ItemNameInput
                value={watchName ?? ""}
                onChange={(v) => { form.setValue("name", v, { shouldDirty: true }); setExisting(null); }}
                onPick={applySuggestion}
                placeholder={t("namePlaceholder")}
                invalid={!!form.formState.errors.name}
              />
            )}
            {existing && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p>{t("suggestExists", { qty: existing.quantity ?? 0, unit: existing.unit ?? "" })}</p>
                  {onOpenExisting && existing.id && (
                    <button type="button" className="mt-1 font-medium text-primary hover:underline" onClick={() => { onOpenChange(false); onOpenExisting(existing.id!); }}>
                      {t("suggestOpenExisting")}
                    </button>
                  )}
                </div>
              </div>
            )}
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{translateMessage(tv, form.formState.errors.name.message)}</p>
            )}
          </div>

          {/* Category + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("category")} *</Label>
              <Select
                value={watchCategory}
                onValueChange={(v) => form.setValue("category", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue>
                    {categoryLabel(t, watchCategory || "Medicamentos")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{categoryLabel(t, c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("unit")} *</Label>
              <Select
                value={watchUnit}
                onValueChange={(v) => form.setValue("unit", v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue>
                    {unitLabel(t, watchUnit || "unidades")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{unitLabel(t, u)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Stock */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("stock")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quantity">{t("currentQuantity")} *</Label>
                <Input id="quantity" type="number" min="0" step="0.1" {...bindField(form, "quantity")} />
                {form.formState.errors.quantity && (
                  <p className="text-xs text-destructive">{translateMessage(tv, form.formState.errors.quantity.message)}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="minStock">{t("minStock")}</Label>
                <Input id="minStock" type="number" min="0" step="0.1" {...bindField(form, "minStock")} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Cost + Expiry */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="unitCost">{t("unitCostEur")}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                <Input id="unitCost" type="number" min="0" step="0.01" placeholder="0.00" className="pl-6" {...bindField(form, "unitCost")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiryDate">{t("expiryDate")}</Label>
              <Input id="expiryDate" type="date" {...bindField(form, "expiryDate")} />
            </div>
          </div>

          {/* Supplier */}
          <div className="space-y-1.5">
            <Label htmlFor="supplier">{t("supplier")}</Label>
            <Input id="supplier" placeholder={t("supplierPlaceholder")} {...bindField(form, "supplier")} />
          </div>

          {/* Selling: price, VAT and national code / barcode */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="salePrice">{t("salePrice")}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                <Input id="salePrice" type="number" min="0" step="0.01" placeholder="0.00" className="pl-6" {...bindField(form, "salePrice")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="barcode">{t("barcode")}</Label>
              <Input id="barcode" placeholder={t("barcodePlaceholder")} {...bindField(form, "barcode")} />
            </div>
          </div>
          <TaxRateChips
            label={t("saleVat")}
            value={watchTax === "" || watchTax === undefined ? defaultTax : Number(watchTax)}
            onChange={(v) => form.setValue("taxRate", v, { shouldDirty: true })}
          />

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">{t("notes")}</Label>
            <Textarea id="notes" rows={2} placeholder={tc("notesPlaceholder")} {...bindField(form, "notes")} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" className="flex-1 bg-primary text-primary-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? tc("saveChanges") : t("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
