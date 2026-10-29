"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { PET_CONDITIONS, conditionLabel, isConditionKey } from "@/lib/pet-conditions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Tap to toggle common chronic conditions; anything else can be typed in
export function ConditionsPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations("patients");
  const [custom, setCustom] = useState("");
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  const extra = value.filter((k) => !isConditionKey(k));

  function add() {
    const v = custom.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setCustom("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PET_CONDITIONS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={cn(
              "px-2.5 h-7 rounded-full text-xs border transition-colors",
              value.includes(key) ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {conditionLabel(t, key)}
          </button>
        ))}
        {extra.map((key) => (
          <span key={key} className="pl-2.5 pr-1 h-7 rounded-full text-xs border bg-primary text-primary-foreground border-primary flex items-center gap-1">
            {key}
            <button type="button" onClick={() => toggle(key)} className="rounded-full hover:bg-white/20 p-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          className="h-8 text-sm"
          value={custom}
          placeholder={t("conditionOther")}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <button type="button" onClick={add} className="h-8 w-8 shrink-0 rounded-md border flex items-center justify-center hover:bg-muted">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Read-only chips
export function ConditionChips({ conditions, className }: { conditions: string[]; className?: string }) {
  const t = useTranslations("patients");
  if (!conditions.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {conditions.map((c) => (
        <span key={c} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
          {conditionLabel(t, c)}
        </span>
      ))}
    </div>
  );
}
