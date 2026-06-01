"use client";

import { useState, useTransition, useEffect, useCallback, memo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
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
import { Search, Plus, Trash2, Loader2, Receipt, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

type ItemType = "CONSULTATION" | "MEDICATION" | "SERVICE" | "OTHER";

interface ItemData {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  type: ItemType;
  serviceId: string | null;
}

let _id = 0;
const nextId = () => String(++_id);

function newItem(): ItemData {
  return { id: nextId(), description: "", quantity: 1, unitPrice: 0, type: "SERVICE", serviceId: null };
}

function itemFromInvoice(item: InvoiceFull["items"][0]): ItemData {
  return {
    id: nextId(),
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    type: (item.type as ItemType) ?? "SERVICE",
    serviceId: item.serviceId ?? null,
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
}

const ItemRow = memo(function ItemRow({ idx, item, services, onUpdate, onRemove, onAddNewService, isOnly, descriptionError }: ItemRowProps) {
  const t = useTranslations("finances");
  const lineTotal = item.quantity * item.unitPrice;

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

      {/* Service picker */}
      <ServicePicker
        services={services}
        value={item.serviceId}
        onChange={(svc) => {
          if (svc) {
            onUpdate(item.id, {
              serviceId: svc.id,
              description: svc.name,
              unitPrice: item.unitPrice === 0 && svc.price != null ? svc.price : item.unitPrice,
            });
          } else {
            onUpdate(item.id, { serviceId: null });
          }
        }}
        onAddNew={() => onAddNewService(item.id)}
        compact
      />

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

interface InvoiceDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice?: InvoiceFull;
  services: ServiceFlat[];
  presetAppointment?: AppointmentOption;
  onSaved: (invoice: InvoiceFull) => void;
}

export function InvoiceDialog({ open, onOpenChange, invoice, services, presetAppointment, onSaved }: InvoiceDialogProps) {
  const t = useTranslations("finances");
  const tc = useTranslations("common");
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

  useEffect(() => {
    if (open && presetAppointment && !invoice) {
      applyAppointment(presetAppointment);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetAppointment]);

  // Reset on close (new invoice only)
  useEffect(() => {
    if (!open && !isEdit) {
      setTimeout(() => {
        setAppointmentId("");
        setSelectedApt(null);
        setAptQuery("");
        setAptResults([]);
        setItems([newItem()]);
        setErrors({});
      }, 150);
    }
  }, [open, isEdit]);

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

  function applyAppointment(apt: AppointmentOption) {
    setSelectedApt(apt);
    setAppointmentId(apt.id);
    setAptQuery("");
    setAptResults([]);
    if (apt.service) {
      setItems([{
        id: nextId(),
        description: apt.service.name,
        quantity: 1,
        unitPrice: apt.service.price ?? 0,
        type: "SERVICE",
        serviceId: apt.service.id,
      }]);
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

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

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
        items: items.map(({ description, quantity, unitPrice, type, serviceId }) => ({
          description,
          quantity,
          unitPrice: unitPrice || 0.01,
          type,
          serviceId: serviceId ?? null,
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
          toast.error(typeof result.error === "string" ? result.error : t("errorSave"));
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editInvoice") : t("newInvoice")}</DialogTitle>
        </DialogHeader>

        <form className="space-y-5 mt-2" onSubmit={handleSubmit}>
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
                      {format(new Date(selectedApt.startTime), "EEEE, d MMMM yyyy · HH:mm", { locale: es })}
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
                            {format(new Date(apt.startTime), "d MMM yyyy · HH:mm", { locale: es })}
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
              />
            ))}

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t("total")}</span>
              </div>
              <span className="text-lg font-bold text-primary">{fmt(total)}</span>
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
            description: svc.name,
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
