"use client";

import { useState, useTransition, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { InvoiceFull, AppointmentOption } from "@/lib/actions/invoices";
import {
  createInvoice,
  updateInvoice,
  searchAppointmentsWithoutInvoice,
} from "@/lib/actions/invoices";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, Trash2, Loader2, Receipt, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEM_TYPES = [
  { value: "CONSULTATION", label: "Consulta" },
  { value: "MEDICATION", label: "Medicamento" },
  { value: "SERVICE", label: "Servicio" },
  { value: "OTHER", label: "Otro" },
] as const;

const itemSchema = z.object({
  description: z.string().min(1, "Requerido"),
  quantity: z.coerce.number().int().min(1, "Mín. 1"),
  unitPrice: z.coerce.number().positive("Debe ser > 0"),
  type: z.enum(["CONSULTATION", "MEDICATION", "SERVICE", "OTHER"]),
});

const schema = z.object({
  appointmentId: z.string().min(1, "Selecciona una cita"),
  items: z.array(itemSchema).min(1, "Añade al menos un artículo"),
});

type FormData = z.infer<typeof schema>;

function fmt(v: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
}

interface InvoiceDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice?: InvoiceFull;
  onSaved: (invoice: InvoiceFull) => void;
}

export function InvoiceDialog({ open, onOpenChange, invoice, onSaved }: InvoiceDialogProps) {
  const isEdit = !!invoice;
  const [isSaving, startSave] = useTransition();

  const [aptQuery, setAptQuery] = useState("");
  const [aptResults, setAptResults] = useState<AppointmentOption[]>([]);
  const [selectedApt, setSelectedApt] = useState<AppointmentOption | null>(null);
  const [isSearching, startSearch] = useTransition();

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: invoice
      ? {
          appointmentId: invoice.appointmentId,
          items: invoice.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            type: item.type,
          })),
        }
      : {
          appointmentId: "",
          items: [{ description: "", quantity: 1, unitPrice: 0, type: "CONSULTATION" as const }],
        },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const watchItems = form.watch("items");
  const total = watchItems.reduce((s, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    return s + qty * price;
  }, 0);

  // Populate selected appointment on edit
  useEffect(() => {
    if (invoice) {
      setSelectedApt({
        id: invoice.appointmentId,
        title: invoice.appointment.title,
        startTime: invoice.appointment.startTime,
        type: invoice.appointment.type,
        pet: invoice.appointment.pet,
      } as AppointmentOption);
    }
  }, [invoice]);

  // Reset on close
  useEffect(() => {
    if (!open && !isEdit) {
      setTimeout(() => {
        form.reset();
        setSelectedApt(null);
        setAptQuery("");
        setAptResults([]);
      }, 150);
    }
  }, [open, isEdit, form]);

  // Appointment search
  useEffect(() => {
    if (aptQuery.length < 2) { setAptResults([]); return; }
    startSearch(async () => {
      const results = await searchAppointmentsWithoutInvoice(
        aptQuery,
        invoice?.appointmentId
      );
      setAptResults(results);
    });
  }, [aptQuery, invoice?.appointmentId]);

  async function handleSubmit(data: FormData) {
    startSave(async () => {
      if (isEdit) {
        const result = await updateInvoice(invoice.id, data);
        if ("error" in result) { toast.error("Error al actualizar"); return; }
        toast.success("Factura actualizada");
        onSaved(result.invoice);
      } else {
        const result = await createInvoice(data);
        if ("error" in result) { toast.error("Error al crear factura"); return; }
        toast.success("Factura creada");
        onSaved(result.invoice);
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar factura" : "Nueva factura"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit as Parameters<typeof form.handleSubmit>[0])} className="space-y-5 mt-2">
          {/* Appointment selector */}
          <div className="space-y-1.5">
            <Label>Cita *</Label>
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
                    onClick={() => { setSelectedApt(null); form.setValue("appointmentId", ""); }}
                  >
                    Cambiar
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cita por paciente o título..."
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
                        onClick={() => {
                          setSelectedApt(apt);
                          form.setValue("appointmentId", apt.id);
                          setAptQuery("");
                          setAptResults([]);
                        }}
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
                {form.formState.errors.appointmentId && (
                  <p className="text-xs text-destructive">{form.formState.errors.appointmentId.message}</p>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Line items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Artículos
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => append({ description: "", quantity: 1, unitPrice: 0, type: "SERVICE" })}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Añadir artículo
              </Button>
            </div>

            {form.formState.errors.items?.message && (
              <p className="text-xs text-destructive">{form.formState.errors.items.message}</p>
            )}

            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[1fr_80px_90px_100px_32px] gap-2 text-xs text-muted-foreground font-medium px-1">
              <span>Descripción</span>
              <span>Tipo</span>
              <span>Cant.</span>
              <span>P. unit.</span>
              <span />
            </div>

            {fields.map((field, idx) => {
              const qty = Number(watchItems[idx]?.quantity) || 0;
              const price = Number(watchItems[idx]?.unitPrice) || 0;
              const lineTotal = qty * price;
              return (
                <div key={field.id} className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-[1fr_80px_90px_100px_32px] sm:gap-2 sm:items-start border border-border rounded-lg p-2 sm:border-0 sm:p-0">
                  <div>
                    <Input
                      placeholder="Descripción *"
                      {...form.register(`items.${idx}.description`)}
                      className={cn(form.formState.errors.items?.[idx]?.description && "border-destructive")}
                    />
                  </div>
                  <Select
                    defaultValue={field.type}
                    onValueChange={(v) => form.setValue(`items.${idx}.type`, v as FormData["items"][0]["type"])}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ITEM_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    placeholder="1"
                    {...form.register(`items.${idx}.quantity`)}
                  />
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className="pl-6"
                      {...form.register(`items.${idx}.unitPrice`)}
                    />
                  </div>
                  <div className="flex items-center gap-2 sm:block">
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      className="text-muted-foreground hover:text-destructive mt-1.5"
                      disabled={fields.length === 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {lineTotal > 0 && (
                      <span className="text-xs font-medium sm:hidden">{fmt(lineTotal)}</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Total */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Total</span>
              </div>
              <span className="text-lg font-bold text-primary">{fmt(total)}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-primary text-primary-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Guardar cambios" : "Crear factura"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
