"use client";

import { useState, useTransition, useEffect, useCallback, memo } from "react";
import { format } from "date-fns";
import { useDateLocale } from "@/lib/date-locale";
import { useTranslations } from "next-intl";
import type { InvoiceFull, AppointmentOption } from "@/lib/actions/invoices";
import {
  createInvoice,
  updateInvoice,
  searchAppointmentsWithoutInvoice,
} from "@/lib/actions/invoices";
import type { ServiceFlat } from "@/lib/actions/services";
import { ServicePicker } from "@/components/services/ServicePicker";
import { ServiceQuickAddDialog } from "@/components/services/ServiceQuickAddDialog";
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
import { Separator } from "@/components/ui/separator";
import { Search, Plus, Trash2, Loader2, Receipt, CalendarDays, Package } from "lucide-react";
import { ProductPicker } from "./ProductPicker";
import { TaxRateChips } from "./TaxRateChips";
import { getBillingDefaults } from "@/lib/actions/billing";
import { taxBreakdown } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { NumberInput } from "@/components/common/NumberInput";
import { useCan } from "@/components/layout/PermissionsProvider";

type ItemType = "CONSULTATION" | "MEDICATION" | "SERVICE" | "OTHER";

interface ItemData {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  type: ItemType;
  serviceId: string | null;
  taxRate: number;
  // Product sold from stock (taken out of stock when the bill is saved)
  inventoryItemId: string | null;
  stockLeft?: number;
  stockUnit?: string;
  // Price still as stored (VAT included), not yet shown the clinic's way
  fromSaved?: boolean;
}

let _id = 0;
const nextId = () => String(++_id);

function newItem(taxRate = 21): ItemData {
  return { id: nextId(), description: "", quantity: 1, unitPrice: 0, type: "SERVICE", serviceId: null, taxRate, inventoryItemId: null };
}

function itemFromInvoice(item: InvoiceFull["items"][0]): ItemData {
  return {
    id: nextId(),
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    type: (item.type as ItemType) ?? "SERVICE",
    serviceId: item.serviceId ?? null,
    taxRate: item.taxRate,
    inventoryItemId: item.inventoryItemId ?? null,
    fromSaved: true,
  };
}

function fmt(v: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
}

interface ItemRowProps {
  idx: number;
  item: ItemData;
  services: ServiceFlat[];
  onUpdate: (id: string, patch: Partial<ItemData>) => void;
  onRemove: (id: string) => void;
  onAddNewService: (rowId: string) => void;
  isOnly: boolean;
  descriptionError?: string;
  // Prices typed before VAT
  netPrices?: boolean;
}

const ItemRow = memo(function ItemRow({ idx, item, services, onUpdate, onRemove, onAddNewService, isOnly, descriptionError, netPrices }: ItemRowProps) {
  const t = useTranslations("finances");
  // What the line will cost the customer
  const lineTotal = item.quantity * item.unitPrice * (netPrices ? 1 + item.taxRate / 100 : 1);

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

      {item.inventoryItemId ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package className="w-3.5 h-3.5" />
          {t("fromStock")}
          {item.stockLeft !== undefined && <span>· {t("stockLeft", { qty: item.stockLeft, unit: item.stockUnit ?? "" })}</span>}
        </p>
      ) : (
      /* Service picker */
      <ServicePicker
        services={services}
        value={item.serviceId}
        onChange={(svc) => {
          if (svc) {
            onUpdate(item.id, {
              serviceId: svc.id,
              description: svc.officialName ?? svc.name,
              unitPrice: item.unitPrice === 0 && svc.price != null ? svc.price : item.unitPrice,
            });
          } else {
            onUpdate(item.id, { serviceId: null });
          }
        }}
        onAddNew={() => onAddNewService(item.id)}
        compact
      />
      )}

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

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("quantityShort")}</Label>
          <NumberInput
            integer
            fallback={1}
            className="h-8 text-sm"
            value={item.quantity}
            onValueChange={(v) => onUpdate(item.id, { quantity: Math.max(1, v) })}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{netPrices ? t("unitPriceNet") : t("unitPriceGross")}</Label>
          <NumberInput
            className="h-8 text-sm"
            value={item.unitPrice}
            onValueChange={(v) => onUpdate(item.id, { unitPrice: Math.max(0, v) })}
          />
        </div>
      </div>
      <TaxRateChips label={t("vat")} value={item.taxRate} onChange={(taxRate) => onUpdate(item.id, { taxRate })} />
    </div>
  );
});

interface InvoiceDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice?: InvoiceFull;
  services: ServiceFlat[];
  presetAppointment?: AppointmentOption;
  onSaved: (invoice: InvoiceFull) => void;
}

export function InvoiceDialog({ open, onOpenChange, invoice: invoiceProp, services, presetAppointment, onSaved }: InvoiceDialogProps) {
  const dateLocale = useDateLocale();
  const t = useTranslations("finances");
  const tc = useTranslations("common");
  const canWrite = useCan("invoice.write");
  // An unpaid invoice that already exists for the chosen appointment can be opened here for editing
  const [existingInvoice, setExistingInvoice] = useState<InvoiceFull | null>(null);
  const invoice = invoiceProp ?? existingInvoice ?? undefined;
  const isEdit = !!invoice;
  const [isSaving, startSave] = useTransition();

  // Appointment selection
  const [appointmentId, setAppointmentId] = useState(invoice?.appointmentId ?? "");
  const [aptQuery, setAptQuery] = useState("");
  const [aptResults, setAptResults] = useState<AppointmentOption[]>([]);
  const [selectedApt, setSelectedApt] = useState<AppointmentOption | null>(null);
  const [isSearching, startSearch] = useTransition();

  // Items — plain state, no RHF field array
  const [items, setItems] = useState<ItemData[]>(() =>
    invoice?.items.length ? invoice.items.map(itemFromInvoice) : [newItem()]
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [defaultTax, setDefaultTax] = useState(21);
  // Prices typed before VAT (the server adds it); stored lines always include VAT
  const [netPrices, setNetPrices] = useState(false);
  const [productOpen, setProductOpen] = useState(false);

  useEffect(() => {
    getBillingDefaults().then(({ defaultTaxRate, pricesIncludeTax }) => {
      setDefaultTax(defaultTaxRate);
      if (!pricesIncludeTax) {
        setNetPrices(true);
        // Lines loaded from a saved bill carry VAT: show them before VAT
        setItems((prev) => prev.map((i) => (i.fromSaved ? { ...i, unitPrice: Math.round((i.unitPrice / (1 + i.taxRate / 100)) * 100) / 100, fromSaved: false } : i)));
      }
      // Lines added before the setting arrived follow the clinic's rate
      setItems((prev) => prev.map((i) => (!i.inventoryItemId && i.taxRate === 21 ? { ...i, taxRate: defaultTaxRate } : i)));
    });
  }, []);

  // Service quick-add
  const [localServices, setLocalServices] = useState<ServiceFlat[]>(services);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddRowId, setQuickAddRowId] = useState<string | null>(null);

  // Populate selected appointment on edit or preset
  useEffect(() => {
    if (invoice?.appointment && invoice.appointmentId) {
      setSelectedApt({
        id: invoice.appointmentId,
        title: invoice.appointment.title,
        startTime: invoice.appointment.startTime,
        type: invoice.appointment.type,
        service: null,
        pet: invoice.appointment.pet,
      } as AppointmentOption);
      setAppointmentId(invoice.appointmentId);
    }
  }, [invoice]);

  function openExistingInvoice(existing: InvoiceFull) {
    setExistingInvoice(existing);
    setItems(existing.items.length ? existing.items.map(itemFromInvoice) : [newItem()]);
    setErrors({});
  }

  useEffect(() => {
    if (open && presetAppointment && !invoice) {
      applyAppointment(presetAppointment);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetAppointment]);

  // Reset on close (new invoice only)
  useEffect(() => {
    if (!open && !invoiceProp) {
      setTimeout(() => {
        setExistingInvoice(null);
        setAppointmentId("");
        setSelectedApt(null);
        setAptQuery("");
        setAptResults([]);
        setItems([newItem(defaultTax)]);
        setErrors({});
        setProductOpen(false);
      }, 150);
    }
  }, [open, invoiceProp, defaultTax]);

  // Appointment search
  useEffect(() => {
    if (aptQuery.length < 2) { setAptResults([]); return; }
    startSearch(async () => {
      const results = await searchAppointmentsWithoutInvoice(
        aptQuery,
        invoice?.appointmentId ?? undefined
      );
      setAptResults(results);
    });
  }, [aptQuery, invoice?.appointmentId]);

  // "Category › Service" in the clinic language, so invoice lines are self-explanatory
  function officialServicePath(serviceId: string, fallback: string) {
    const parts: string[] = [];
    let cur = localServices.find((s) => s.id === serviceId);
    while (cur) {
      parts.unshift(cur.officialName ?? cur.name);
      cur = cur.parentId ? localServices.find((s) => s.id === cur!.parentId) : undefined;
    }
    return parts.length ? parts.join(" › ") : fallback;
  }

  function applyAppointment(apt: AppointmentOption) {
    setSelectedApt(apt);
    setAppointmentId(apt.id);
    setAptQuery("");
    setAptResults([]);
    // One invoice line per appointment service (main one first)
    const aptServices = [...(apt.service ? [apt.service] : []), ...(apt.extraServices ?? [])];
    if (aptServices.length) {
      setItems(aptServices.map((svc) => ({
        id: nextId(),
        description: officialServicePath(svc.id, svc.officialName ?? svc.name),
        quantity: 1,
        unitPrice: svc.price ?? localServices.find((s) => s.id === svc.id)?.price ?? 0,
        type: "SERVICE" as const,
        serviceId: svc.id,
        taxRate: defaultTax,
        inventoryItemId: null,
      })));
    }
  }

  const updateItem = useCallback((id: string, patch: Partial<ItemData>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    if (patch.description !== undefined) {
      setErrors((prev) => { const next = { ...prev }; delete next[`${id}.desc`]; return next; });
    }
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const openQuickAdd = useCallback((rowId: string) => {
    setQuickAddRowId(rowId);
    setQuickAddOpen(true);
  }, []);

  // Summary the way the bill will be stored: VAT-included lines, base and VAT per rate
  const summary = taxBreakdown(
    items.map((i) => {
      const unit = netPrices ? i.unitPrice * (1 + i.taxRate / 100) : i.unitPrice;
      return { description: "", quantity: i.quantity, unitPrice: unit, taxRate: i.taxRate, total: Math.round(i.quantity * unit * 100) / 100 };
    })
  );
  const total = summary.total;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!appointmentId) errs["appointmentId"] = tc("required");
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
      const data = {
        appointmentId,
        items: items.map(({ description, quantity, unitPrice, type, serviceId, taxRate, inventoryItemId }) => ({
          description,
          quantity,
          unitPrice: unitPrice || 0.01,
          type,
          serviceId: serviceId ?? null,
          taxRate,
          inventoryItemId,
        })),
      };
      if (isEdit) {
        const result = await updateInvoice(invoice.id, data);
        if ("error" in result) { toast.error(t("errorSave")); return; }
        toast.success(t("saved"));
        onSaved(result.invoice);
      } else {
        const result = await createInvoice(data);
        if ("error" in result) {
          const existing = "existing" in result ? result.existing : null;
          if (existing && existing.status === "PENDING" && canWrite) {
            toast.error(t("invoiceExists"), {
              description: t("invoiceExistsPending"),
              action: { label: t("editInvoice"), onClick: () => openExistingInvoice(existing) },
              duration: 10000,
            });
          } else if (existing) {
            toast.error(t("invoiceExists"), { description: t(existing.status === "PAID" ? "invoiceExistsPaid" : "invoiceExistsCancelled") });
          } else {
            toast.error(typeof result.error === "string" && t.has(result.error) ? t(result.error) : t("errorSave"));
          }
          return;
        }
        toast.success(t("saved"));
        onSaved(result.invoice);
      }
      onOpenChange(false);
    });
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editInvoice") : t("newInvoice")}</DialogTitle>
        </DialogHeader>

        <form className="space-y-5 mt-2 min-w-0" onSubmit={handleSubmit}>
          {/* Appointment selector */}
          <div className="space-y-1.5">
            <Label>{t("appointment")} *</Label>
            {selectedApt ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-start gap-2">
                  <CalendarDays className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{selectedApt.pet.name} — {selectedApt.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {format(new Date(selectedApt.startTime), "EEEE, d MMMM yyyy · HH:mm", { locale: dateLocale })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedApt.pet.owner.firstName} {selectedApt.pet.owner.lastName}
                    </p>
                  </div>
                </div>
                {!isEdit && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => { setSelectedApt(null); setAppointmentId(""); }}
                  >
                    {tc("edit")}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={t("appointmentSearch")}
                    className="pl-9"
                    value={aptQuery}
                    onChange={(e) => setAptQuery(e.target.value)}
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {aptResults.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden divide-y divide-border max-h-44 overflow-y-auto">
                    {aptResults.map((apt) => (
                      <button
                        key={apt.id}
                        type="button"
                        className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/50"
                        onClick={() => applyAppointment(apt)}
                      >
                        <CalendarDays className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{apt.pet.name} — {apt.title}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {format(new Date(apt.startTime), "d MMM yyyy · HH:mm", { locale: dateLocale })}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {errors["appointmentId"] && (
                  <p className="text-xs text-destructive">{errors["appointmentId"]}</p>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Line items */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("lineItems")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setProductOpen((o) => !o)}
                >
                  <Package className="w-3.5 h-3.5 mr-1" />
                  {t("addProduct")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setItems((prev) => [...prev, newItem(defaultTax)])}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {t("addItem")}
                </Button>
              </div>
            </div>

            {productOpen && (
              <ProductPicker
                autoFocus
                onPick={(p) => {
                  if ("newName" in p) return;
                  setItems((prev) => {
                    // Replace the empty starter line instead of leaving it behind
                    const base = prev.length === 1 && !prev[0].description && !prev[0].unitPrice ? [] : prev;
                    return [
                      ...base,
                      {
                        id: nextId(),
                        description: p.name,
                        quantity: 1,
                        unitPrice: p.salePrice ?? 0,
                        type: "MEDICATION" as const,
                        serviceId: null,
                        taxRate: p.taxRate ?? defaultTax,
                        inventoryItemId: p.id,
                        stockLeft: p.quantity,
                        stockUnit: p.unit,
                      },
                    ];
                  });
                  setProductOpen(false);
                }}
              />
            )}

            {items.map((item, idx) => (
              <ItemRow
                key={item.id}
                idx={idx}
                item={item}
                services={localServices}
                onUpdate={updateItem}
                onRemove={removeItem}
                onAddNewService={openQuickAdd}
                isOnly={items.length === 1}
                descriptionError={errors[`${item.id}.desc`]}
                netPrices={netPrices}
              />
            ))}

            <div className="pt-2 border-t border-border space-y-0.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("taxBase")}</span>
                <span>{fmt(summary.base)}</span>
              </div>
              {summary.rows.filter((r) => r.tax).map((r) => (
                <div key={r.rate} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("vatShort", { rate: r.rate })}</span>
                  <span>{fmt(r.tax)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t("total")}</span>
                </div>
                <span className="text-lg font-bold text-primary">{fmt(total)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{netPrices ? t("pricesNetHint") : t("pricesGrossHint")}</p>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" className="flex-1 bg-primary text-primary-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? tc("save") : t("createInvoice")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <ServiceQuickAddDialog
      open={quickAddOpen}
      onOpenChange={setQuickAddOpen}
      services={localServices}
      onCreated={(svc) => {
        const flat: ServiceFlat = {
          id: svc.id,
          name: svc.name,
          price: svc.price,
          color: null,
          isActive: true,
          sortOrder: 0,
          parentId: null,
        };
        setLocalServices((prev) => [...prev, flat]);
        if (quickAddRowId) {
          updateItem(quickAddRowId, {
            serviceId: svc.id,
            description: svc.officialName ?? svc.name,
          });
          if (svc.price != null) {
            setItems((prev) =>
              prev.map((item) =>
                item.id === quickAddRowId && item.unitPrice === 0
                  ? { ...item, unitPrice: svc.price! }
                  : item
              )
            );
          }
        }
        setQuickAddRowId(null);
      }}
    />
    </>
  );
}
