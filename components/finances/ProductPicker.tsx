"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Package, Search } from "lucide-react";
import { searchStockItems, type StockMatch } from "@/lib/actions/inventory";
import { Input } from "@/components/ui/input";
import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";

// Search the stock by name or barcode / national code and pick a product
export function ProductPicker({
  onPick,
  placeholder,
  autoFocus,
  className,
  allowNew,
}: {
  onPick: (item: StockMatch | { newName: string }) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  // Offer "create «text»" when nothing matches (deliveries)
  allowNew?: boolean;
}) {
  const t = useTranslations("inventory");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [isSearching, startSearch] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(() => startSearch(async () => { setResults(await searchStockItems(query)); setActive(0); }), 200);
    return () => clearTimeout(h);
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const offerNew = allowNew && query.trim().length >= 2 && !results.some((r) => r.name.toLowerCase() === query.trim().toLowerCase());
  const options = results.length + (offerNew ? 1 : 0);

  function pick(idx: number) {
    if (idx < results.length) onPick(results[idx]);
    else if (offerNew) onPick({ newName: query.trim() });
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder ?? t("productSearch")}
        className="pl-9 h-9"
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (!options) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter") { e.preventDefault(); pick(active); }
        }}
      />
      {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
      {open && options > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              className={cn("w-full flex items-center gap-2 px-3 py-2 text-left text-sm", i === active ? "bg-muted" : "hover:bg-muted/60")}
            >
              <Package className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.category} · {t("inStock", { qty: r.quantity, unit: r.unit })}
                  {r.supplier ? ` · ${r.supplier}` : ""}
                </p>
              </div>
              {!!r.salePrice && <span className="text-xs font-medium">{formatEur(r.salePrice)}</span>}
            </button>
          ))}
          {offerNew && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(results.length); }}
              className={cn("w-full px-3 py-2 text-left text-sm text-primary", active === results.length ? "bg-muted" : "hover:bg-muted/60")}
            >
              + {t("createNamed", { name: query.trim() })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
