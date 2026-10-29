"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { useDateLocale } from "@/lib/date-locale";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { InvoiceFull } from "@/lib/actions/invoices";
import { deleteInvoice } from "@/lib/actions/invoices";
import { cancelBill, voidPayment, issueFullInvoice, rebill, recordPayment, refundBill } from "@/lib/actions/billing";
import type { PaymentMethod } from "@prisma/client";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Printer,
  FileText,
  X,
  Undo2,
  RotateCcw,
} from "lucide-react";
import { cn, formatInvoiceId } from "@/lib/utils";
import { SpeciesBadge } from "@/components/patients/SpeciesBadge";
import { useCan } from "@/components/layout/PermissionsProvider";
import { PaymentForm } from "./PaymentForm";
import { paymentLabel } from "@/lib/payment-methods";
import { docNumber, dueOf } from "@/lib/billing";
import { formatEur } from "@/lib/format";

const statusConfig = {
  PENDING:   { label: "pending",    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",  Icon: Clock },
  PAID:      { label: "paid",       className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", Icon: CheckCircle },
  CANCELLED: { label: "cancelled",  className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300", Icon: XCircle },
};

const itemTypeLabels: Record<string, string> = {
  CONSULTATION: "itemTypeConsultation",
  MEDICATION: "itemTypeMedication",
  SERVICE: "itemTypeService",
  OTHER: "itemTypeOther",
};

const docKindLabel = { SIMPLIFIED: "docSimplified", FULL: "docFull", RECTIFYING: "docRectifying" } as const;

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
  const dateLocale = useDateLocale();
  const t = useTranslations("finances");
  const tc = useTranslations("common");
  const canWrite = useCan("invoice.write");
  const canVoid = useCan("invoice.void");
  const [isUpdating, startUpdate] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [fullOpen, setFullOpen] = useState(false);
  const router = useRouter();

  const stCfg = statusConfig[invoice.status];
  const due = dueOf(invoice);
  const issued = invoice.documents.length > 0;
  const replaced = new Set(invoice.documents.map((d) => d.replacesId).filter(Boolean));
  const activeFull = invoice.documents.some((d) => d.kind === "FULL" && !replaced.has(d.id));
  const partiallyPaid = invoice.status === "PENDING" && invoice.paidAmount > 0;

  function apply(result: { invoice: InvoiceFull } | { error: string }, success: string) {
    if ("error" in result) {
      toast.error(t.has(`err_${result.error}`) ? t(`err_${result.error}`) : t("errorSave"));
      return false;
    }
    toast.success(success);
    onUpdated(result.invoice);
    return true;
  }

  function handlePay(amount: number, method: Parameters<typeof recordPayment>[1]["method"]) {
    startUpdate(async () => {
      const result = await recordPayment(invoice.id, { amount, method });
      apply(result, amount >= due ? t("paidInFull") : t("paidPartially"));
    });
  }

  function handleCancel() {
    // A wrongly ticked payment is undone by removing the payment, not by cancelling the bill
    if (invoice.paidAmount > 0 && !confirm(t("cancelPaidWarning"))) return;
    const reason = issued ? prompt(t("cancelReasonPrompt")) : confirm(t("cancelConfirm")) ? "" : null;
    if (reason === null) return;
    startUpdate(async () => {
      apply(await cancelBill(invoice.id, reason), issued ? t("rectifiedToast") : t("cancelledToast"));
    });
  }

  function handleDelete() {
    if (!confirm(t("deletePermanentConfirm"))) return;
    startDelete(async () => {
      const result = await deleteInvoice(invoice.id);
      if ("error" in result) { toast.error(t("err_invoiceIssued")); return; }
      toast.success(t("deleted"));
      onDeleted(invoice.id);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight">{t("invoice")} <span className="font-mono text-sm text-muted-foreground font-normal">{formatInvoiceId(invoice.number, invoice.createdAt)}</span></SheetTitle>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", partiallyPaid ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" : stCfg.className)}>
                  {partiallyPaid ? t("partiallyPaid") : t(stCfg.label)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(invoice.createdAt), "d MMM yyyy", { locale: dateLocale })}
                </span>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-5 px-5 pb-4">
          {/* Patient */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("patient")}</p>
            <div className="flex items-center gap-2">
              <PawPrint className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm">{invoice.pet.name}</span>
              <SpeciesBadge species={invoice.pet.species} size="sm" />
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm">
                {invoice.pet.owner.firstName} {invoice.pet.owner.lastName}
                {invoice.pet.owner.nif && <span className="text-muted-foreground"> · {invoice.pet.owner.nif}</span>}
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
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("appointment")}</p>
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{invoice.appointment.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{invoice.appointment.veterinarian.name}</span>
                </div>
                <p className="text-xs text-muted-foreground ml-6 capitalize">
                  {format(new Date(invoice.appointment.startTime), "EEEE, d MMMM yyyy · HH:mm", { locale: dateLocale })}
                </p>
              </div>
            </>
          )}

          <Separator />

          {/* Items */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("itemsCount", { count: invoice.items.length })}
            </p>
            <div className="space-y-1">
              {invoice.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.service?.name ?? t(item.type ? itemTypeLabels[item.type] : "itemTypeService")} · {item.quantity} × {formatEur(item.unitPrice)} · {t("vatShort", { rate: item.taxRate })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold shrink-0">{formatEur(item.total)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-semibold">{t("total")}</span>
              <span className="text-xl font-bold text-primary">{formatEur(invoice.totalAmount)}</span>
            </div>
            {invoice.paidAmount > 0 && invoice.status !== "CANCELLED" && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("paidSoFar")}</span>
                <span>{formatEur(invoice.paidAmount)}</span>
              </div>
            )}
            {due > 0 && (
              <div className="flex items-center justify-between text-sm font-semibold text-red-600 dark:text-red-400">
                <span>{t("stillDue")}</span>
                <span>{formatEur(due)}</span>
              </div>
            )}
          </div>

          {/* Payments */}
          {invoice.payments.length > 0 && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("payments")}</p>
                {invoice.payments.map((p) => (
                  <div key={p.id} className={cn("text-sm", p.voidedAt && "opacity-60")}>
                    <div className="flex items-center gap-2">
                      {p.amount < 0 ? <Undo2 className="w-4 h-4 text-red-600 shrink-0" /> : p.voidedAt ? <XCircle className="w-4 h-4 text-muted-foreground shrink-0" /> : <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
                      <span className={cn("flex-1 min-w-0", p.voidedAt && "line-through")}>
                        {p.amount < 0 && <span className="text-red-600 dark:text-red-400 mr-1">{t("refund")} ·</span>}
                        {t(paymentLabel[p.method])}
                        <span className="text-xs text-muted-foreground ml-1.5">
                          {format(new Date(p.paidAt), "d MMM · HH:mm", { locale: dateLocale })}
                          {p.receivedBy && ` · ${p.receivedBy.name}`}
                        </span>
                      </span>
                      <span className={cn("font-medium", p.amount < 0 && "text-red-600 dark:text-red-400", p.voidedAt && "line-through")}>{formatEur(p.amount)}</span>
                      <button
                        type="button"
                        title={t("printReceipt")}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => window.open(`/print/receipt/${p.id}`, "_blank")}
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      {canVoid && !p.voidedAt && (
                        <button
                          type="button"
                          title={t("removePayment")}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            const reason = prompt(t("voidReasonPrompt"));
                            if (reason === null) return;
                            startUpdate(async () => {
                              const result = await voidPayment(p.id, reason);
                              if (apply(result, t("paymentVoided")) && "paymentId" in result && confirm(t("voidPrintAsk"))) {
                                window.open(`/print/receipt/${result.paymentId}`, "_blank");
                              }
                            });
                          }}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {p.voidedAt && (
                      <p className="text-xs text-muted-foreground ml-6">
                        {t("voidedInfo", {
                          date: format(new Date(p.voidedAt), "d MMM · HH:mm", { locale: dateLocale }),
                          name: p.voidedBy?.name ?? "—",
                          reason: p.voidReason ?? "",
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Cancelled bill with money on it: give it back, or remove a payment that never happened */}
          {canVoid && invoice.status === "CANCELLED" && invoice.paidAmount > 0.005 && (
            <>
              <Separator />
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2">
                <p className="text-sm font-medium">{t("cancelledWithMoney", { amount: formatEur(invoice.paidAmount) })}</p>
                <p className="text-xs text-muted-foreground">{t("cancelledWithMoneyHint")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT_METHODS.map(({ id, label }) => (
                    <Button
                      key={id}
                      size="sm"
                      variant="outline"
                      className="h-8 bg-background"
                      disabled={isUpdating}
                      onClick={() => {
                        if (!confirm(t("refundConfirm", { amount: formatEur(invoice.paidAmount), method: t(label) }))) return;
                        startUpdate(async () => { apply(await refundBill(invoice.id, id as PaymentMethod), t("refunded")); });
                      }}
                    >
                      <Undo2 className="w-3.5 h-3.5 mr-1" />
                      {t("refundBy", { method: t(label) })}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Cancelled by mistake: bill the same again */}
          {canWrite && invoice.status === "CANCELLED" && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <Button
                  variant="outline"
                  className="w-full gap-1.5"
                  disabled={isUpdating}
                  onClick={() => {
                    if (!confirm(t("rebillConfirm"))) return;
                    startUpdate(async () => {
                      const result = await rebill(invoice.id);
                      if ("error" in result) { toast.error(t("errorSave")); return; }
                      toast.success(t("rebilled"));
                      onUpdated(result.invoice);
                      // Lists get the new bill
                      router.refresh();
                    });
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                  {t("rebill")}
                </Button>
                <p className="text-xs text-muted-foreground">{t("rebillHint")}</p>
              </div>
            </>
          )}

          {/* Take a payment */}
          {canWrite && due > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("registerPayment")}</p>
                <PaymentForm due={due} busy={isUpdating} onPay={handlePay} />
              </div>
            </>
          )}

          {/* Fiscal documents */}
          {(issued || (canWrite && invoice.status !== "CANCELLED")) && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("fiscalDocuments")}</p>
                {!issued && <p className="text-xs text-muted-foreground">{t("ticketOnPayment")}</p>}
                {invoice.documents.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-sm">
                    <FileText className={cn("w-4 h-4 shrink-0", d.kind === "RECTIFYING" ? "text-red-500" : "text-primary")} />
                    <span className={cn("flex-1 min-w-0", replaced.has(d.id) && "line-through text-muted-foreground")}>
                      {t(docKindLabel[d.kind])} <span className="font-mono">{docNumber(d)}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">{format(new Date(d.issuedAt), "d MMM yyyy", { locale: dateLocale })}</span>
                    </span>
                    <span className="text-xs font-medium">{formatEur(d.total)}</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => window.open(`/print/invoice/${d.id}`, "_blank")}>
                      <Printer className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {canWrite && invoice.status !== "CANCELLED" && !activeFull && (
                  <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setFullOpen(true)}>
                    <FileText className="w-4 h-4" />
                    {t("issueFull")}
                  </Button>
                )}
                {fullOpen && (
                  <FullInvoiceForm
                    invoice={invoice}
                    busy={isUpdating}
                    onCancel={() => setFullOpen(false)}
                    onSubmit={(customer) =>
                      startUpdate(async () => {
                        if (apply(await issueFullInvoice(invoice.id, customer), t("fullIssued"))) setFullOpen(false);
                      })
                    }
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-4 px-5 pb-5 border-t border-border space-y-2">
          {canWrite && !issued && invoice.status !== "CANCELLED" && (
            <Button className="w-full bg-primary text-primary-foreground" onClick={onEdit}>
              <Pencil className="w-4 h-4 mr-2" />
              {t("editInvoice")}
            </Button>
          )}
          {canVoid && invoice.status !== "CANCELLED" && (
            <Button
              variant="outline"
              className="w-full text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              onClick={handleCancel}
              disabled={isUpdating}
            >
              <XCircle className="w-4 h-4 mr-2" />
              {issued ? t("cancelIssued") : t("cancelInvoice")}
            </Button>
          )}
          {canVoid && !issued && (
          <Button
            variant="outline"
            className="w-full text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            {tc("delete")}
          </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Customer's tax details for a full invoice, prefilled from the owner
function FullInvoiceForm({
  invoice,
  busy,
  onCancel,
  onSubmit,
}: {
  invoice: InvoiceFull;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (c: { name: string; nif: string; address?: string }) => void;
}) {
  const t = useTranslations("finances");
  const tc = useTranslations("common");
  const o = invoice.pet.owner;
  const [name, setName] = useState(`${o.firstName} ${o.lastName}`.trim());
  const [nif, setNif] = useState(o.nif ?? "");
  const [address, setAddress] = useState([o.address, o.postalCode].filter(Boolean).join(", "));
  return (
    <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
      <p className="text-xs text-muted-foreground">{t("fullHint")}</p>
      <div className="space-y-1">
        <Label className="text-xs">{t("customerName")}</Label>
        <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">NIF / NIE / CIF *</Label>
        <Input className="h-9 uppercase" value={nif} onChange={(e) => setNif(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("customerAddress")}</Label>
        <Input className="h-9" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>{tc("cancel")}</Button>
        <Button size="sm" className="flex-1" disabled={busy || nif.trim().length < 5 || !name.trim()} onClick={() => onSubmit({ name, nif, address })}>
          {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
          {t("issueFullConfirm")}
        </Button>
      </div>
    </div>
  );
}
