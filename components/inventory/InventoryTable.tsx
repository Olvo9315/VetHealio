"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { useDateLocale } from "@/lib/date-locale";
import { useTranslations } from "next-intl";
import { categoryLabel, unitLabel } from "@/lib/inventory-labels";
import type { InventoryItem, StockStatus } from "@/lib/actions/inventory";
import { getInventoryItems } from "@/lib/actions/inventory";
// Plain helpers: importing them via the "use server" actions file would turn them into server calls
import { getStockStatus, getExpiryStatus } from "@/lib/utils/inventoryHelpers";
import { InventoryDialog } from "./InventoryDialog";
import { DeliveryDialog } from "./DeliveryDialog";
import { InventoryDetailSheet } from "./InventoryDetailSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Loader2,
  Package,
  ChevronRight,
  Download,
  Minus, PackagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { adjustStock } from "@/lib/actions/inventory";
import { toast } from "sonner";
import { useCan } from "@/components/layout/PermissionsProvider";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
}

function exportCSV(items: InventoryItem[], t: (key: string) => string) {
  const rows = [
    [t("name"), t("category"), t("quantity"), t("unit"), t("csvMinStock"), t("unitCostShort"), t("csvTotalValue"), t("expiry"), t("supplier")],
    ...items.map((item) => [
      item.name,
      categoryLabel(t, item.category),
      item.quantity.toString(),
      unitLabel(t, item.unit),
      item.minStock.toString(),
      item.unitCost?.toFixed(2) ?? "",
      item.unitCost ? (item.unitCost * item.quantity).toFixed(2) : "",
      item.expiryDate ? format(new Date(item.expiryDate), "dd/MM/yyyy") : "",
      item.supplier ?? "",
    ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inventario_${format(new Date(), "yyyy-MM-dd")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const STOCK_STATUS_OPTIONS: { value: StockStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "allStock" },
  { value: "LOW", label: "stockLow" },
  { value: "OUT", label: "stockOut" },
  { value: "OK", label: "stockInStock" },
];

const stockConfig: Record<StockStatus, { label: string; className: string }> = {
  OK:  { label: "stockOk",  className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  LOW: { label: "stockLowShort", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  OUT: { label: "stockOut", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

const expiryConfig = {
  OK:            { label: "",           className: "" },
  NONE:          { label: "",           className: "" },
  EXPIRING_SOON: { label: "expiresSoon", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  EXPIRED:       { label: "expired",    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

interface InventoryTableProps {
  initialItems: InventoryItem[];
  categories: string[];
}

export function InventoryTable({ initialItems, categories }: InventoryTableProps) {
  const dateLocale = useDateLocale();
  const t = useTranslations("inventory");
  const canManage = useCan("inventory.manage");
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  // A received delivery refreshes the page data
  useEffect(() => setItems(initialItems), [initialItems]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [stockFilter, setStockFilter] = useState<StockStatus | "ALL">("ALL");
  const [isLoading, startLoad] = useTransition();
  const [isAdjusting, startAdjust] = useTransition();

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  function applyFilters(s: string, cat: string, stock: StockStatus | "ALL") {
    startLoad(async () => {
      const results = await getInventoryItems({
        search: s || undefined,
        category: cat !== "ALL" ? cat : undefined,
        stockStatus: stock,
      });
      setItems(results);
    });
  }

  function handleSearch(v: string) {
    setSearch(v);
    applyFilters(v, categoryFilter, stockFilter);
  }

  function handleCategory(v: string) {
    setCategoryFilter(v);
    applyFilters(search, v, stockFilter);
  }

  function handleStockFilter(v: StockStatus | "ALL") {
    setStockFilter(v);
    applyFilters(search, categoryFilter, v);
  }

  function handleSaved(item: InventoryItem) {
    setItems((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      return exists ? prev.map((i) => (i.id === item.id ? item : i)) : [item, ...prev];
    });
    setSelectedItem(item);
  }

  function handleUpdated(item: InventoryItem) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    setSelectedItem(item);
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDetailOpen(false);
    setSelectedItem(null);
  }

  function openDetail(item: InventoryItem) {
    setSelectedItem(item);
    setDetailOpen(true);
  }

  function openEdit() {
    if (!selectedItem) return;
    setEditingItem(selectedItem);
    setDetailOpen(false);
    setEditOpen(true);
  }

  function handleQuickAdjust(e: React.MouseEvent, item: InventoryItem, delta: number) {
    e.stopPropagation();
    startAdjust(async () => {
      const result = await adjustStock(item.id, delta);
      if ("error" in result) { toast.error(t("errorAdjust")); return; }
      handleUpdated(result.item);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-2 flex-wrap">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("search")}
              className="pl-9"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Category filter */}
          <Select value={categoryFilter} onValueChange={(v) => handleCategory(v ?? "ALL")}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue>
                {categoryFilter === "ALL" ? t("allCategories") : categoryLabel(t, categoryFilter)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allCategories")}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{categoryLabel(t, c)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Stock status filter */}
          <Select value={stockFilter} onValueChange={(v) => handleStockFilter(v as StockStatus | "ALL")}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>
                {t(STOCK_STATUS_OPTIONS.find((o) => o.value === stockFilter)?.label ?? "allStock")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STOCK_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Wraps onto two lines on a phone instead of running off the screen */}
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button variant="outline" className="gap-1.5" onClick={() => setDeliveryOpen(true)}>
            <PackagePlus className="w-4 h-4" />
            {t("receiveDelivery")}
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => exportCSV(items, t)}>
            <Download className="w-4 h-4 mr-1.5" />
            CSV
          </Button>
          {canManage && (
          <Button className="bg-primary text-primary-foreground" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t("new")}
          </Button>
          )}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-xl overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("category")}</TableHead>
              <TableHead>{t("stock")}</TableHead>
              <TableHead>{t("unitCostShort")}</TableHead>
              <TableHead>{t("expiry")}</TableHead>
              <TableHead>{t("supplier")}</TableHead>
              <TableHead className="w-24 text-center">{t("adjustColumn")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t("noItems")}</p>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const stCfg = stockConfig[getStockStatus(item)];
                const expStatus = getExpiryStatus(item.expiryDate);
                const expCfg = expiryConfig[expStatus];
                return (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => openDetail(item)}
                  >
                    <TableCell className="font-medium text-sm">{item.name}</TableCell>
                    <TableCell>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                        {categoryLabel(t, item.category)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.quantity} {unitLabel(t, item.unit)}</span>
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", stCfg.className)}>
                          {t(stCfg.label)}
                        </span>
                      </div>
                      {item.minStock > 0 && (
                        <p className="text-xs text-muted-foreground">{t("minShort", { n: item.minStock })}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.unitCost !== null ? fmtCurrency(item.unitCost) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {item.expiryDate ? (
                        <div>
                          <p className="text-xs">{format(new Date(item.expiryDate), "d MMM yyyy", { locale: dateLocale })}</p>
                          {expCfg.label && (
                            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", expCfg.className)}>
                              {t(expCfg.label)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.supplier ?? "—"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          className="w-6 h-6 rounded border border-border hover:bg-muted flex items-center justify-center disabled:opacity-40"
                          onClick={(e) => handleQuickAdjust(e, item, -1)}
                          disabled={isAdjusting || item.quantity === 0}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <button
                          className="w-6 h-6 rounded border border-border hover:bg-muted flex items-center justify-center disabled:opacity-40"
                          onClick={(e) => handleQuickAdjust(e, item, 1)}
                          disabled={isAdjusting}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t("noItems")}</p>
          </div>
        ) : (
          items.map((item) => {
            const stCfg = stockConfig[getStockStatus(item)];
            const expStatus = getExpiryStatus(item.expiryDate);
            const expCfg = expiryConfig[expStatus];
            return (
              <button
                key={item.id}
                className="w-full flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-left"
                onClick={() => openDetail(item)}
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Package className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{categoryLabel(t, item.category)}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs font-medium">{item.quantity} {unitLabel(t, item.unit)}</span>
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", stCfg.className)}>
                      {t(stCfg.label)}
                    </span>
                    {expCfg.label && (
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", expCfg.className)}>
                        {t(expCfg.label)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {item.unitCost !== null && (
                    <span className="text-xs text-muted-foreground">{fmtCurrency(item.unitCost)}</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>
            );
          })
        )}
      </div>

      {items.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {t("itemsCount", { count: items.length })}
          {" · "}
          {t("totalValueIs", { amount: fmtCurrency(items.reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0)) })}
        </p>
      )}

      <DeliveryDialog open={deliveryOpen} onOpenChange={setDeliveryOpen} />

      {/* Create dialog */}
      <InventoryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(i) => { handleSaved(i); setDetailOpen(true); }}
      />

      {/* Edit dialog */}
      {editingItem && (
        <InventoryDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          item={editingItem}
          onSaved={handleSaved}
        />
      )}

      {/* Detail sheet */}
      {selectedItem && (
        <InventoryDetailSheet
          open={detailOpen}
          onOpenChange={setDetailOpen}
          item={selectedItem}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onEdit={openEdit}
        />
      )}
    </div>
  );
}
