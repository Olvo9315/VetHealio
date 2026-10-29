"use client";

import { useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";
import { PRESVET_PURPOSES, PRESVET_ROUTES } from "@/lib/presvet";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PresvetValues = {
  antibiotic?: boolean;
  nationalCode?: string;
  route?: string;
  treatmentDays?: number | string;
  packages?: number | string;
  purpose?: string;
  exceptional?: boolean;
};

// Extra data an antibiotic line needs for PRESVET. Switched on automatically when the active
// ingredient is an antimicrobial; the vet can switch it by hand.
export function PresvetFields({ value, onChange, suggested }: { value: PresvetValues; onChange: (v: PresvetValues) => void; suggested: boolean }) {
  const t = useTranslations("presvet");
  const set = (patch: PresvetValues) => onChange({ ...value, ...patch });
  return (
    <div className={cn("col-span-2 rounded-lg border p-2.5 space-y-2", value.antibiotic ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20" : "border-dashed")}>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-primary" checked={!!value.antibiotic} onChange={(e) => set({ antibiotic: e.target.checked })} />
        <ShieldAlert className="w-4 h-4 text-amber-600" />
        <span className="font-medium">{t("antibioticToggle")}</span>
        {suggested && !value.antibiotic && <span className="text-xs text-amber-700 dark:text-amber-400">· {t("looksAntibiotic")}</span>}
      </label>
      {value.antibiotic && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="space-y-1 block">
            <span className="text-[11px] text-muted-foreground">{t("field_nationalCode")} *</span>
            <Input className="h-8 text-sm" value={value.nationalCode ?? ""} onChange={(e) => set({ nationalCode: e.target.value })} placeholder="581022" />
          </label>
          <label className="space-y-1 block">
            <span className="text-[11px] text-muted-foreground">{t("field_packages")} *</span>
            <Input className="h-8 text-sm" inputMode="decimal" value={value.packages ?? ""} onChange={(e) => set({ packages: e.target.value.replace(",", ".") })} placeholder="1" />
          </label>
          <label className="space-y-1 block">
            <span className="text-[11px] text-muted-foreground">{t("field_treatmentDays")} *</span>
            <Input className="h-8 text-sm" inputMode="numeric" value={value.treatmentDays ?? ""} onChange={(e) => set({ treatmentDays: e.target.value.replace(/\D/g, "") })} placeholder="7" />
          </label>
          <label className="space-y-1 block">
            <span className="text-[11px] text-muted-foreground">{t("field_route")} *</span>
            <select className="h-8 w-full rounded-md border bg-background px-2 text-sm" value={value.route ?? ""} onChange={(e) => set({ route: e.target.value })}>
              <option value="">—</option>
              {PRESVET_ROUTES.map((r) => <option key={r} value={r}>{t(`route_${r}`)}</option>)}
            </select>
          </label>
          <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground mr-1">{t("field_purpose")} *</span>
            {PRESVET_PURPOSES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set({ purpose: p })}
                className={cn("h-7 px-2.5 rounded-full text-xs border", value.purpose === p ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted")}
              >
                {t(`purpose_${p}`)}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs ml-auto cursor-pointer">
              <input type="checkbox" className="accent-primary" checked={!!value.exceptional} onChange={(e) => set({ exceptional: e.target.checked })} />
              {t("exceptional")}
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
