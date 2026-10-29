import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Page views as tabs. On a phone they share the width, icon above a short name that may wrap, so
// every view is visible without scrolling sideways; from `sm` up they sit in a row as usual.
export function ViewTabs({ tabs, active }: { tabs: { id: string; href: string; icon: LucideIcon; label: string }[]; active: string }) {
  return (
    <nav
      className="grid w-full gap-0.5 rounded-lg border p-0.5 bg-muted/40 sm:flex sm:w-auto sm:self-start sm:gap-1 print:hidden"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map(({ id, href, icon: Icon, label }) => (
        <Link
          key={id}
          href={href}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 min-w-0 px-0.5 py-1 leading-tight text-center rounded-md transition-colors",
            // Five or more views: a size smaller so the longest name fits on one line
            tabs.length > 4 ? "text-[10px]" : "text-[11px]",
            "sm:flex-row sm:gap-1.5 sm:px-3 sm:py-0 sm:h-8 sm:text-sm sm:whitespace-nowrap",
            active === id ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span className="max-w-full">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
