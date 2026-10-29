"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { History, Package } from "lucide-react";
import { searchMedications, type MedicationSuggestion } from "@/lib/actions/prescriptions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Medicine name with suggestions: medicines this clinic prescribed before (picking one also fills
// the active ingredient, units, last dose and PRESVET data) and products in stock
export function MedicationInput({
  value,
  onChange,
  onPick,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (s: MedicationSuggestion) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const t = useTranslations("prescriptions");
  const [results, setResults] = useState<MedicationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only search while the user types (not when a saved name is loaded)
    if (!typed.current || value.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(() => searchMedications(value).then((r) => { setResults(r); setActive(0); }), 200);
    return () => clearTimeout(h);
  }, [value]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function pick(s: MedicationSuggestion) {
    onPick(s);
    typed.current = false;
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={box} className="relative">
      <Input
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => { typed.current = true; onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !results.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter") { e.preventDefault(); pick(results[active]); }
        }}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={`${r.source}-${r.name}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              className={cn("w-full flex items-start gap-2 px-3 py-2 text-left text-sm", i === active ? "bg-muted" : "hover:bg-muted/60")}
            >
              {r.source === "history" ? <History className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /> : <Package className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.source === "history"
                    ? [r.activeIngredient, r.posology].filter(Boolean).join(" · ") || t("suggestHistory")
                    : t("suggestStock")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
