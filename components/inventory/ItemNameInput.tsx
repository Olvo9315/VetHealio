"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { History, Package, Pill } from "lucide-react";
import { suggestInventoryItems, type ItemSuggestion } from "@/lib/actions/inventory";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fmt = (v: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);

// Name of a new stock item with suggestions while typing: items already in stock (to avoid a
// duplicate or copy their data), medicines prescribed before and products sold on bills before
export function ItemNameInput({
  value,
  onChange,
  onPick,
  placeholder,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (s: ItemSuggestion) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const t = useTranslations("inventory");
  const [results, setResults] = useState<ItemSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!typed.current || value.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(() => suggestInventoryItems(value).then((r) => { setResults(r); setActive(0); }), 200);
    return () => clearTimeout(h);
  }, [value]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function pick(s: ItemSuggestion) {
    onPick(s);
    typed.current = false;
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={box} className="relative">
      <Input
        id="name"
        name="name"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(invalid && "border-destructive")}
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
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg max-h-72 overflow-y-auto">
          {results.map((r, i) => {
            const Icon = r.source === "stock" ? Package : r.source === "rx" ? Pill : History;
            const detail =
              r.source === "stock"
                ? [t("suggestInStock", { qty: r.quantity ?? 0, unit: r.unit ?? "" }), r.salePrice ? `${t("salePrice")} ${fmt(r.salePrice)}` : null, r.barcode ? `CN ${r.barcode}` : null]
                : r.source === "rx"
                  ? [t("suggestPrescribed"), r.detail, r.barcode ? `CN ${r.barcode}` : null]
                  : [t("suggestSold"), r.salePrice ? `${t("salePrice")} ${fmt(r.salePrice)}` : null, r.taxRate != null ? `IVA ${r.taxRate}%` : null];
            return (
              <button
                key={`${r.source}-${r.id ?? r.name}`}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(r); }}
                className={cn("w-full flex items-start gap-2 px-3 py-2 text-left text-sm", i === active ? "bg-muted" : "hover:bg-muted/60")}
              >
                <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", r.source === "stock" ? "text-amber-600" : "text-muted-foreground")} />
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{detail.filter(Boolean).join(" · ")}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
