"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { InventoryItem } from "@/lib/actions/inventory";
import { adjustStock, deleteInventoryItem, getStockStatus, getExpiryStatus } from "@/lib/actions/inventory";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Pencil,
  Trash2,
  Loader2,
  Package,
  Minus,
  Plus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Calendar,
  Tag,
  Truck,
  FileText,
  Euro,
} from "lucide-react";
import { cn } from "@/lib/utils";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
}

const stockColors = {
  OK:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  LOW: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  OUT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};
const stockLabels = { OK: "En stock", LOW: "Stock bajo", OUT: "Agotado" };

const expiryColors = {
  OK:             "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  EXPIRING_SOON:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  EXPIRED:        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  NONE:           "",
};
const expiryLabels = { OK: "Vigente", EXPIRING_SOON: "Próximo a vencer", EXPIRED: "Vencido", NONE: "" };

interface InventoryDetailSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: InventoryItem;
  onUpdated: (item: InventoryItem) => void;
  onDeleted: (id: string) => void;
  onEdit: () => void;
}

export function InventoryDetailSheet({
  open,
  onOpenChange,
  item,
  onUpdated,
  onDeleted,
  onEdit,
}: InventoryDetailSheetProps) {
  const [isAdjusting, startAdjust] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [adjustInput, setAdjustInput] = useState("");

  const stockStatus = getStockStatus(item);
  const expiryStatus = getExpiryStatus(item.expiryDate);

  function handleQuickAdjust(delta: number) {
    startAdjust(async () => {
      const result = await adjustStock(item.id, delta);
      if ("error" in result) { toast.error("Error al ajustar stock"); return; }
      toast.success(`Stock ${delta > 0 ? "aumentado" : "reducido"}`);
      onUpdated(result.item);
    });
  }

  function handleCustomAdjust() {
    const val = parseFloat(adjustInput);
    if (isNaN(val) || val === 0) return;
    startAdjust(async () => {
      const result = await adjustStock(item.id, val);
      if ("error" in result) { toast.error("Error al ajustar stock"); return; }
      toast.success("Stock actualizado");
      setAdjustInput("");
      onUpdated(result.item);
    });
  }

  function handleDelete() {
    if (!confirm(`¿Eliminar "${item.name}" del inventario?`)) return;
    startDelete(async () => {
      await deleteInventoryItem(item.id);
      toast.success("Artículo eliminado");
      onDeleted(item.id);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight">{item.name}</SheetTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", stockColors[stockStatus])}>
                  {stockLabels[stockStatus]}
                </span>
                {expiryStatus !== "NONE" && (
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", expiryColors[expiryStatus])}>
                    {expiryLabels[expiryStatus]}
                  </span>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-5">
          {/* Category + Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Categoría</p>
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm">{item.category}</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unidad</p>
              <span className="text-sm">{item.unit}</span>
            </div>
          </div>

          <Separator />

          {/* Stock info */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stock actual</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{item.quantity}</span>
              <span className="text-sm text-muted-foreground">{item.unit}</span>
              {item.minStock > 0 && (
                <span className="text-xs text-muted-foreground ml-2">
                  (mín. {item.minStock} {item.unit})
                </span>
              )}
            </div>

            {/* Quick adjust */}
            <div className="space-y-2 mt-1">
              <p className="text-xs text-muted-foreground">Ajuste rápido:</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleQuickAdjust(-1)}
                  disabled={isAdjusting || item.quantity === 0}
                >
                  <Minus className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleQuickAdjust(-5)}
                  disabled={isAdjusting || item.quantity < 5}
                >
                  <span className="text-xs">-5</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleQuickAdjust(5)}
                  disabled={isAdjusting}
                >
                  <span className="text-xs">+5</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleQuickAdjust(1)}
                  disabled={isAdjusting}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
                {isAdjusting && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>

              {/* Custom adjust */}
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Ej. +10 o -3"
                  className="h-8 text-sm"
                  value={adjustInput}
                  onChange={(e) => setAdjustInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCustomAdjust()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={handleCustomAdjust}
                  disabled={isAdjusting || !adjustInput}
                >
                  Aplicar
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Details grid */}
          <div className="space-y-3">
            {item.unitCost !== null && (
              <div className="flex items-center gap-2">
                <Euro className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Costo unitario · Valor total</p>
                  <p className="text-sm font-medium">
                    {fmtCurrency(item.unitCost)} · {fmtCurrency(item.unitCost * item.quantity)}
                  </p>
                </div>
              </div>
            )}

            {item.expiryDate && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Fecha de vencimiento</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium capitalize">
                      {format(new Date(item.expiryDate), "d MMMM yyyy", { locale: es })}
                    </p>
                    {expiryStatus === "EXPIRED" && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                    {expiryStatus === "EXPIRING_SOON" && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                    {expiryStatus === "OK" && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                  </div>
                </div>
              </div>
            )}

            {item.supplier && (
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Proveedor</p>
                  <p className="text-sm font-medium">{item.supplier}</p>
                </div>
              </div>
            )}

            {item.notes && (
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Notas</p>
                  <p className="text-sm">{item.notes}</p>
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground pt-2">
            Actualizado: {format(new Date(item.updatedAt), "d MMM yyyy · HH:mm", { locale: es })}
          </div>
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-border space-y-2">
          <Button className="w-full bg-primary text-primary-foreground" onClick={onEdit}>
            <Pencil className="w-4 h-4 mr-2" />
            Editar artículo
          </Button>
          <Button
            variant="outline"
            className="w-full text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Eliminar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
