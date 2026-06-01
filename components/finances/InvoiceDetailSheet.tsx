"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { InvoiceFull } from "@/lib/actions/invoices";
import { updateInvoiceStatus, deleteInvoice } from "@/lib/actions/invoices";
import type { PaymentMethod } from "@prisma/client";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pencil,
  Trash2,
  Loader2,
  Receipt,
  PawPrint,
  User,
  Phone,
  CalendarDays,
  Stethoscope,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { cn, formatInvoiceId } from "@/lib/utils";
import { SpeciesBadge } from "@/components/patients/SpeciesBadge";

const statusConfig = {
  PENDING:   { label: "Pendiente",  className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",  Icon: Clock },
  PAID:      { label: "Pagado",     className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", Icon: CheckCircle },
  CANCELLED: { label: "Cancelado",  className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300", Icon: XCircle },
};

const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
};

const itemTypeLabels: Record<string, string> = {
  CONSULTATION: "Consulta",
  MEDICATION: "Medicamento",
  SERVICE: "Servicio",
  OTHER: "Otro",
};

function fmt(v: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
}

interface InvoiceDetailSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: InvoiceFull;
  onUpdated: (invoice: InvoiceFull) => void;
  onDeleted: (id: string) => void;
  onEdit: () => void;
}

export function InvoiceDetailSheet({
  open,
  onOpenChange,
  invoice,
  onUpdated,
  onDeleted,
  onEdit,
}: InvoiceDetailSheetProps) {
  const [isUpdating, startUpdate] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");

  const stCfg = statusConfig[invoice.status];

  function handleMarkPaid() {
    startUpdate(async () => {
      const updated = await updateInvoiceStatus(invoice.id, "PAID", paymentMethod);
      toast.success("Factura marcada como pagada");
      onUpdated(updated);
    });
  }

  function handleCancel() {
    if (!confirm("¿Cancelar esta factura?")) return;
    startUpdate(async () => {
      const updated = await updateInvoiceStatus(invoice.id, "CANCELLED");
      toast.success("Factura cancelada");
      onUpdated(updated);
    });
  }

  function handleDelete() {
    if (!confirm("¿Eliminar esta factura permanentemente?")) return;
    startDelete(async () => {
      await deleteInvoice(invoice.id);
      toast.success("Factura eliminada");
      onDeleted(invoice.id);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight">Factura <span className="font-mono text-sm text-muted-foreground font-normal">{formatInvoiceId(invoice.number, invoice.createdAt)}</span></SheetTitle>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", stCfg.className)}>
                  {stCfg.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(invoice.createdAt), "d MMM yyyy", { locale: es })}
                </span>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-5">
          {/* Patient */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Paciente</p>
            <div className="flex items-center gap-2">
              <PawPrint className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm">{invoice.pet.name}</span>
              <SpeciesBadge species={invoice.pet.species} size="sm" />
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm">
                {invoice.pet.owner.firstName} {invoice.pet.owner.lastName}
              </span>
            </div>
            <a
              href={`tel:${invoice.pet.owner.phone}`}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Phone className="w-4 h-4 shrink-0" />
              {invoice.pet.owner.phone}
            </a>
          </div>

          {invoice.appointment && (
            <>
              <Separator />

              {/* Appointment */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cita</p>
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{invoice.appointment.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{invoice.appointment.veterinarian.name}</span>
                </div>
                <p className="text-xs text-muted-foreground ml-6 capitalize">
                  {format(new Date(invoice.appointment.startTime), "EEEE, d MMMM yyyy · HH:mm", { locale: es })}
                </p>
              </div>
            </>
          )}

          {invoice.status === "PAID" && invoice.paidAt && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pago</p>
                <p className="text-sm">
                  {invoice.paymentMethod ? paymentLabels[invoice.paymentMethod] : "—"}
                  <span className="text-muted-foreground ml-2 text-xs">
                    · {format(new Date(invoice.paidAt), "d MMM yyyy · HH:mm", { locale: es })}
                  </span>
                </p>
              </div>
            </>
          )}

          <Separator />

          {/* Items */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Artículos ({invoice.items.length})
            </p>
            <div className="space-y-1">
              {invoice.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.service?.name ?? (item.type ? itemTypeLabels[item.type] : "Servicio")} · {item.quantity} × {fmt(item.unitPrice)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold shrink-0">{fmt(item.total)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-xl font-bold text-primary">{fmt(invoice.totalAmount)}</span>
            </div>
          </div>

          {/* Mark as paid */}
          {invoice.status === "PENDING" && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Registrar pago
                </p>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod((v ?? "CASH") as PaymentMethod)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue>
                      {paymentMethod === "CASH" ? "Efectivo" : paymentMethod === "CARD" ? "Tarjeta" : "Transferencia"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Efectivo</SelectItem>
                    <SelectItem value="CARD">Tarjeta</SelectItem>
                    <SelectItem value="TRANSFER">Transferencia</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleMarkPaid}
                  disabled={isUpdating}
                >
                  {isUpdating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Marcar como pagado
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-4 border-t border-border space-y-2">
          {invoice.status === "PENDING" && (
            <Button className="w-full bg-primary text-primary-foreground" onClick={onEdit}>
              <Pencil className="w-4 h-4 mr-2" />
              Editar factura
            </Button>
          )}
          {invoice.status === "PENDING" && (
            <Button
              variant="outline"
              className="w-full text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              onClick={handleCancel}
              disabled={isUpdating}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancelar factura
            </Button>
          )}
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
