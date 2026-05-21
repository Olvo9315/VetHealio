"use client";

import type { InvoiceStats } from "@/lib/actions/invoices";
import { TrendingUp, Clock, Receipt, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(amount: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(amount);
}

interface FinancesStatsProps {
  stats: InvoiceStats;
}

export function FinancesStats({ stats }: FinancesStatsProps) {
  const cards = [
    {
      label: "Ingresos del mes",
      value: fmt(stats.revenueThisMonth),
      sub: `${stats.paidThisMonth} facturas pagadas`,
      icon: TrendingUp,
      color: "emerald",
    },
    {
      label: "Pendiente de cobro",
      value: fmt(stats.revenuePending),
      sub: "Facturas sin pagar",
      icon: Clock,
      color: "amber",
    },
    {
      label: "Facturas este mes",
      value: stats.invoicesThisMonth.toString(),
      sub: "Total emitidas",
      icon: Receipt,
      color: "blue",
    },
    {
      label: "Cobradas este mes",
      value: stats.paidThisMonth.toString(),
      sub: "Pagos confirmados",
      icon: CheckCircle,
      color: "primary",
    },
  ] as const;

  const colorMap = {
    emerald: {
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      icon: "text-emerald-600 dark:text-emerald-400",
      ring: "ring-emerald-100 dark:ring-emerald-800",
    },
    amber: {
      bg: "bg-amber-50 dark:bg-amber-900/20",
      icon: "text-amber-600 dark:text-amber-400",
      ring: "ring-amber-100 dark:ring-amber-800",
    },
    blue: {
      bg: "bg-blue-50 dark:bg-blue-900/20",
      icon: "text-blue-600 dark:text-blue-400",
      ring: "ring-blue-100 dark:ring-blue-800",
    },
    primary: {
      bg: "bg-primary/10",
      icon: "text-primary",
      ring: "ring-primary/20",
    },
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => {
        const colors = colorMap[card.color];
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3"
          >
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center ring-1", colors.bg, colors.ring)}>
              <Icon className={cn("w-4 h-4", colors.icon)} />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">{card.value}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">{card.label}</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{card.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
