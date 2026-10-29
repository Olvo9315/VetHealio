"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { getItemTrace } from "@/lib/actions/inventory";
import { cn } from "@/lib/utils";

type Trace = Awaited<ReturnType<typeof getItemTrace>>;

// Lots in stock (earliest expiry first) and the latest movements of an item: deliveries, sales, adjustments
export function ItemTrace({ itemId, unit, version }: { itemId: string; unit: string; version?: number }) {
  const t = useTranslations("inventory");
  const [trace, setTrace] = useState<Trace | null>(null);

  useEffect(() => {
    let alive = true;
    getItemTrace(itemId).then((r) => alive && setTrace(r));
    return () => { alive = false; };
  }, [itemId, version]);

  if (!trace) return <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  const today = new Date();

  return (
    <div className="space-y-4">
      {trace.batches.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("lotsInStock")}</p>
          {trace.batches.map((b) => {
            const expired = b.expiryDate && new Date(b.expiryDate) < today;
            return (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span>{t("lotLabel", { lot: b.lot || "—" })}</span>
                <span className={cn("text-xs", expired ? "text-red-600 font-medium" : "text-muted-foreground")}>
                  {b.expiryDate ? format(new Date(b.expiryDate), "dd/MM/yyyy") : "—"}
                </span>
                <span className="font-medium">{b.quantity} {unit}</span>
              </div>
            );
          })}
        </div>
      )}
      {trace.movements.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("movements")}</p>
          {trace.movements.map((m) => (
            <div key={m.id} className="flex items-start gap-2 text-xs">
              <span className={cn("w-14 shrink-0 font-semibold text-right", m.delta > 0 ? "text-emerald-600" : "text-red-600")}>
                {m.delta > 0 ? "+" : ""}{m.delta}
              </span>
              <div className="flex-1 min-w-0">
                <p>
                  {t(`move_${m.reason}`)}
                  {m.invoiceNumber != null && ` · #${m.invoiceNumber}`}
                  {m.supplier && ` · ${m.supplier}`}
                  {m.document && ` · ${m.document}`}
                </p>
                <p className="text-muted-foreground">
                  {format(new Date(m.createdAt), "dd/MM/yyyy HH:mm")}
                  {m.lot && ` · ${t("lotLabel", { lot: m.lot })}`}
                  {m.user && ` · ${m.user}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {!trace.batches.length && !trace.movements.length && <p className="text-xs text-muted-foreground">{t("noMovements")}</p>}
    </div>
  );
}
