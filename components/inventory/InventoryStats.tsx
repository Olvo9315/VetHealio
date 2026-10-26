"use client";

import type { InventoryStats } from "@/lib/actions/inventory";
import { Package, AlertTriangle, CalendarX, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
}

interface InventoryStatsProps {
  stats: InventoryStats;
}

export function InventoryStatsCards({ stats }: InventoryStatsProps) {
  const t = useTranslations("inventory");
  const cards = [
    {
      label: t("statTotal"),
      value: stats.totalItems.toString(),
      sub: t("statTotalSub"),
      icon: Package,
      color: "blue" as const,
    },
    {
      label: t("statLow"),
      value: stats.lowStockCount.toString(),
      sub: t("statLowSub"),
      icon: AlertTriangle,
      color: stats.lowStockCount > 0 ? ("amber" as const) : ("green" as const),
    },
    {
      label: t("statExpiring"),
      value: (stats.expiringSoonCount + stats.expiredCount).toString(),
      sub: t("statExpiringSub", { expired: stats.expiredCount, soon: stats.expiringSoonCount }),
      icon: CalendarX,
      color: stats.expiredCount > 0 ? ("red" as const) : stats.expiringSoonCount > 0 ? ("amber" as const) : ("green" as const),
    },
    {
      label: t("statValue"),
      value: fmtCurrency(stats.totalValue),
      sub: t("statValueSub"),
      icon: TrendingUp,
      color: "primary" as const,
    },
  ];

  const colorMap = {
    blue: { bg: "bg-blue-50 dark:bg-blue-900/20", icon: "text-blue-600 dark:text-blue-400", ring: "ring-blue-100 dark:ring-blue-800" },
    amber: { bg: "bg-amber-50 dark:bg-amber-900/20", icon: "text-amber-600 dark:text-amber-400", ring: "ring-amber-100 dark:ring-amber-800" },
    red: { bg: "bg-red-50 dark:bg-red-900/20", icon: "text-red-600 dark:text-red-400", ring: "ring-red-100 dark:ring-red-800" },
    green: { bg: "bg-emerald-50 dark:bg-emerald-900/20", icon: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-100 dark:ring-emerald-800" },
    primary: { bg: "bg-primary/10", icon: "text-primary", ring: "ring-primary/20" },
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => {
        const c = colorMap[card.color];
        const Icon = card.icon;
        return (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center ring-1", c.bg, c.ring)}>
              <Icon className={cn("w-4 h-4", c.icon)} />
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
