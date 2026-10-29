"use client";

import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { ChevronRight, FileText } from "lucide-react";
import type { EstimateFull } from "@/lib/actions/estimates";
import { estimateState, ESTIMATE_STATE_STYLE } from "@/lib/estimates";
import { cn, formatEstimateId } from "@/lib/utils";

const fmt = (v: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);

// Presupuestos as rows: number, title, date, total and where it stands. `withPet` for lists across patients.
export function EstimatesList({ estimates, onOpen, withPet }: { estimates: EstimateFull[]; onOpen: (e: EstimateFull) => void; withPet?: boolean }) {
  const t = useTranslations("estimates");
  return (
    <div className="space-y-2">
      {estimates.map((e) => {
        const state = estimateState(e);
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => onOpen(e)}
            className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 hover:border-primary/40 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-sky-700 dark:text-sky-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("font-medium text-sm truncate", state === "REJECTED" && "line-through text-muted-foreground")}>{e.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {format(new Date(e.createdAt), "dd/MM/yyyy")} · {formatEstimateId(e.number)}
                {withPet && ` · ${e.pet.name} (${e.pet.owner.firstName} ${e.pet.owner.lastName})`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-semibold text-sm">{fmt(e.total)}</p>
              <span className={cn("text-[11px] px-1.5 py-0.5 rounded-full font-medium", ESTIMATE_STATE_STYLE[state])}>{t(`state_${state}`)}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
