"use client";

import { useState, useTransition, useEffect, useCallback, memo } from "react";
import { createDirectInvoice } from "@/lib/actions/invoices";
import type { InvoiceFull } from "@/lib/actions/invoices";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Loader2, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

type ItemType = "CONSULTATION" | "MEDICATION" | "SERVICE" | "OTHER";
const ITEM_TYPES: ItemType[] = ["CONSULTATION", "MEDICATION", "SERVICE", "OTHER"];

interface ItemData {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  type: ItemType;
}

let _id = 0;
const nextId = () => String(++_id);

function newItem(): ItemData {
  return { id: nextId(), description: "", quantity: 1, unitPrice: 0, type: "SERVICE" };
}

function fmt(v: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
}

interface ItemRowProps {
  idx: number;
  item: ItemData;
  onUpdate: (id: string, patch: Partial<ItemData>) => void;
  onRemove: (id: string) => void;
  isOnly: boolean;
  descriptionError?: string;
}

// React.memo ensures this only re-renders when its own item data changes.
// Changing type in row A will NOT re-render row B.
const ItemRow = memo(function ItemRow({ idx, item, onUpdate, onRemove, isOnly, descriptionError }: ItemRowProps) {
  const t = useTranslations("finances");
  const lineTotal = item.quantity * item.unitPrice;

  const typeLabels: Record<ItemType, string> = {
    CONSULTATION: t("itemTypeConsultation"),
    MEDICATION: t("itemTypeMedication"),
    SERVICE: t("itemTypeService"),
    OTHER: t("itemTypeOther"),
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2.5 bg-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{t("item")} {idx + 1}</span>
        <div className="flex items-center gap-2">
          {lineTotal > 0 && (
            <span className="text-xs font-semibold text-primary">{fmt(lineTotal)}</span>
          )}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            disabled={isOnly}
            className="text-muted-foreground hover:text-destructive disabled:opacity-30"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div>
        <Input
          placeholder={`${t("description")} *`}
          value={item.description}
          onChange={(e) => onUpdate(item.id, { description: e.target.value })}
          className={cn(descriptionError && "border-destructive")}
        />
        {descriptionError && (
          <p className="text-xs text-destructive mt-0.5">{descriptionError}</p>
        )}
      </div>

      <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("type")}</Label>
          <Select value={item.type} onValueChange={(v) => onUpdate(item.id, { type: v as ItemType })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue>{typeLabels[item.type]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ITEM_TYPES.map((v) => (
                <SelectItem key={v} value={v} className="text-xs">{typeLabels[v]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("quantityShort")}</Label>
          <Input
            type="number"
            min="1"
            className="h-8 text-sm"
            value={item.quantity}
            onChange={(e) => onUpdate(item.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("unitPriceLabel")}</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            className="h-8 text-sm"
            value={item.unitPrice}
            onChange={(e) => onUpdate(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>
    </div>
  );
});

interface DirectInvoiceDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presetPetId: string;
  presetPetName: string;
  onSaved: (invoice: InvoiceFull) => void;
}

export function DirectInvoiceDialog({
  open,
  onOpenChange,
  presetPetId,
  presetPetName,
  onSaved,
}: DirectInvoiceDialogProps) {
  const t = useTranslations("finances");
  const tc = useTranslations("common");
  const [isSaving, startSave] = useTransition();
  const [items, setItems] = useState<ItemData[]>(() => [newItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setItems([newItem()]);
      setErrors({});
    }
  }, [open]);

  // Stable callbacks — React.memo in ItemRow depends on these not changing
  const updateItem = useCallback((id: string, patch: Partial<ItemData>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    if (patch.description !== undefined) {
      setErrors((prev) => { const next = { ...prev }; delete next[`${id}.desc`]; return next; });
    }
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    items.forEach((item) => {
      if (!item.description.trim()) errs[`${item.id}.desc`] = tc("required");
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    startSave(async () => {
      const result = await createDirectInvoice({
        petId: presetPetId,
        items: items.map(({ description, quantity, unitPrice, type }) => ({
          description,
          quantity,
          unitPrice: unitPrice || 0.01,
          type,
          serviceId: null,
        })),
      });
      if ("error" in result) { toast.error(t("errorSave")); return; }
      toast.success(t("saved"));
      onSaved(result.invoice);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("newInvoice")}</DialogTitle>
        </DialogHeader>

        <form className="space-y-5 mt-2" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label>{t("patient")}</Label>
            <div className="px-3 py-2 rounded-lg bg-muted text-sm font-medium">{presetPetName}</div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("lineItems")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setItems((prev) => [...prev, newItem()])}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {t("addItem")}
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <ItemRow
                  key={item.id}
                  idx={idx}
                  item={item}
                  onUpdate={updateItem}
                  onRemove={removeItem}
                  isOnly={items.length === 1}
                  descriptionError={errors[`${item.id}.desc`]}
                />
              ))}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-border">
              <div className="flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t("total")}</span>
              </div>
              <span className="text-xl font-bold text-primary">{fmt(total)}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" className="flex-1 bg-primary text-primary-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("createInvoice")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
