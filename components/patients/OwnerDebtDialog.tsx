"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PaymentMethod } from "@prisma/client";
import { getOwnerDebt, payOwnerDebt, type DebtBill } from "@/lib/actions/billing";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentForm } from "@/components/finances/PaymentForm";
import { cents, formatEur } from "@/lib/format";
import { cn, formatInvoiceId } from "@/lib/utils";

// Everything the owner owes, across their pets: pay all of it or the bills ticked, in one payment
export function OwnerDebtDialog({ ownerId, ownerName, open, onOpenChange }: { ownerId: string; ownerName: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations("finances");
  const router = useRouter();
  const [bills, setBills] = useState<DebtBill[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPaying, startPay] = useTransition();

  useEffect(() => {
    if (!open) return;
    setBills(null);
    getOwnerDebt(ownerId).then((d) => {
      setBills(d.bills);
      setSelected(new Set(d.bills.map((b) => b.id)));
    });
  }, [open, ownerId]);

  const due = cents((bills ?? []).filter((b) => selected.has(b.id)).reduce((s, b) => s + b.due, 0));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pay(amount: number, method: PaymentMethod) {
    startPay(async () => {
      const result = await payOwnerDebt(ownerId, { amount, method, invoiceIds: Array.from(selected) });
      if ("error" in result) { toast.error(t("errorSave")); return; }
      toast.success(t("debtPaid", { amount: formatEur(result.paid), count: result.bills }));
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>{t("debtOf", { name: ownerName })}</DialogTitle>
        </DialogHeader>
        {!bills ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : bills.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("noDebt")}</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border divide-y">
              {bills.map((b) => (
                <label key={b.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                  <input type="checkbox" className="w-4 h-4 accent-primary" checked={selected.has(b.id)} onChange={() => toggle(b.id)} />
                  <div className="flex-1 min-w-0 text-sm">
                    <p className="font-medium truncate">{b.petName} · {b.title ?? t("noAppointment")}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{formatInvoiceId(b.number, b.createdAt)}</span> · {format(new Date(b.createdAt), "dd/MM/yyyy")}
                      {b.paid > 0 && ` · ${t("paidSoFarShort", { amount: formatEur(b.paid) })}`}
                    </p>
                  </div>
                  <span className={cn("text-sm font-semibold shrink-0", selected.has(b.id) ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatEur(b.due)}</span>
                </label>
              ))}
            </div>
            {due > 0 && <PaymentForm due={due} busy={isPaying} onPay={pay} />}
            <p className="text-xs text-muted-foreground">{t("debtOrderHint")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
