"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, CreditCard, Landmark, Loader2, Smartphone } from "lucide-react";
import type { PaymentMethod } from "@prisma/client";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { NumberInput } from "@/components/common/NumberInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cents, formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS: Record<PaymentMethod, React.ElementType> = { CARD: CreditCard, CASH: Banknote, BIZUM: Smartphone, TRANSFER: Landmark };

// Take a payment: method, amount (part of the debt is fine) and, for cash, the change to give back
export function PaymentForm({
  due,
  busy,
  onPay,
}: {
  due: number;
  busy?: boolean;
  onPay: (amount: number, method: PaymentMethod) => void;
}) {
  const t = useTranslations("finances");
  const [method, setMethod] = useState<PaymentMethod>("CARD");
  const [amount, setAmount] = useState(due);
  const [given, setGiven] = useState(0);

  useEffect(() => { setAmount(due); setGiven(0); }, [due]);

  const change = method === "CASH" && given > amount ? cents(given - amount) : 0;
  const partial = amount > 0 && amount < due;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        {PAYMENT_METHODS.map(({ id, label }) => {
          const Icon = ICONS[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => setMethod(id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border py-2 text-xs transition-colors",
                method === id ? "border-primary bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon className="w-4 h-4" />
              {t(label)}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("amountToPay")}</Label>
          <NumberInput className="h-9" value={amount} onValueChange={(v) => setAmount(Math.max(0, Math.min(due, v)))} />
        </div>
        {method === "CASH" && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("cashGiven")}</Label>
            <NumberInput className="h-9" placeholder={t("cashGivenPlaceholder")} value={given} onValueChange={(v) => setGiven(Math.max(0, v))} />
          </div>
        )}
      </div>
      {change > 0 && (
        <p className="text-sm rounded-md bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 px-3 py-2">
          {t("changeToGive", { amount: formatEur(change) })}
        </p>
      )}
      {partial && <p className="text-xs text-muted-foreground">{t("partialHint", { left: formatEur(cents(due - amount)) })}</p>}
      <Button
        type="button"
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
        disabled={busy || amount <= 0}
        onClick={() => onPay(cents(amount), method)}
      >
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {t("takePayment", { amount: formatEur(amount) })}
      </Button>
    </div>
  );
}
