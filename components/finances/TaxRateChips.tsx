"use client";

import { TAX_RATES } from "@/lib/billing";
import { cn } from "@/lib/utils";

// VAT rate of a line: 21 / 10 / 4 / 0 %
export function TaxRateChips({ value, onChange, label }: { value: number; onChange: (v: number) => void; label?: string }) {
  return (
    <div className="flex items-center gap-1">
      {label && <span className="text-xs text-muted-foreground mr-1">{label}</span>}
      {TAX_RATES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={cn(
            "h-6 px-1.5 rounded text-[11px] font-medium border transition-colors",
            value === r ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted"
          )}
        >
          {r}%
        </button>
      ))}
    </div>
  );
}
