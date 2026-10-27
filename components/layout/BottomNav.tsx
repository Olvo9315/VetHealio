"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  PawPrint,
  Calendar,
  DollarSign,
  MoreHorizontal,
  ChevronUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MobileDrawer } from "@/components/layout/MobileDrawer";
import type { ClinicBrand } from "@/components/layout/ClinicMark";

const primaryNav = [
  { href: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/patients", icon: PawPrint, key: "patients" },
  { href: "/appointments", icon: Calendar, key: "appointments" },
  { href: "/finances", icon: DollarSign, key: "finances" },
];

// Phone held sideways: the menu takes too much of the little height there is
const LANDSCAPE_QUERY = "(orientation: landscape) and (max-height: 500px)";
const SCROLL_THRESHOLD = 12;

// Sideways the menu starts folded down to a handle; scrolling down or pinch-zooming folds it,
// scrolling up brings it back. Upright it always stays.
function useFoldedInLandscape() {
  const [landscape, setLandscape] = useState(false);
  const [folded, setFolded] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(LANDSCAPE_QUERY);
    const update = () => {
      setLandscape(mq.matches);
      setFolded(mq.matches);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!landscape) return;
    // Any scroller counts (the page, the calendar grid, lists), so listen in the capture phase
    const lastY = new WeakMap<object, number>();
    const onScroll = (e: Event) => {
      const el = e.target instanceof Element ? e.target : document.scrollingElement;
      if (!el) return;
      const y = el.scrollTop;
      const prev = lastY.get(el);
      if (prev === undefined) return void lastY.set(el, y);
      if (Math.abs(y - prev) < SCROLL_THRESHOLD) return;
      setFolded(y > prev);
      lastY.set(el, y);
    };
    const vv = window.visualViewport;
    const onZoom = () => {
      if (vv && vv.scale > 1.05) setFolded(true);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    vv?.addEventListener("resize", onZoom);
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      vv?.removeEventListener("resize", onZoom);
    };
  }, [landscape]);

  return { landscape, folded: landscape && folded, toggle: () => setFolded((f) => !f) };
}

interface BottomNavProps {
  showStaff?: boolean;
  hiddenRoutes?: string[];
  clinic: ClinicBrand;
}

export function BottomNav({ showStaff, hiddenRoutes = [], clinic }: BottomNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { landscape, folded, toggle } = useFoldedInLandscape();

  const isMoreActive = ["/medical-records", "/inventory", "/services", "/settings", ...(showStaff ? ["/staff"] : [])].some((p) =>
    pathname.startsWith(p)
  );

  return (
    <>
      <nav
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border safe-area-bottom",
          "transition-transform duration-300 ease-out",
          folded && "translate-y-full"
        )}
      >
        {/* Handle that stays on screen when the menu is folded down */}
        {landscape && (
          <button
            type="button"
            onClick={toggle}
            aria-label={t(folded ? "showMenu" : "hideMenu")}
            className="absolute -top-6 left-1/2 -translate-x-1/2 h-6 w-14 rounded-t-xl border border-b-0 border-border bg-background/95 backdrop-blur-md flex items-center justify-center text-muted-foreground"
          >
            <ChevronUp className={cn("w-4 h-4 transition-transform duration-300", !folded && "rotate-180")} />
          </button>
        )}
        <ul className={cn("flex", landscape ? "h-12" : "h-16")}>
          {primaryNav.map(({ href, icon: Icon, key }) => {
            const isActive = pathname.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  className="flex flex-col items-center justify-center h-full gap-1 relative"
                >
                  <div
                    className={cn(
                      "w-12 h-7 flex items-center justify-center rounded-full transition-all duration-200",
                      isActive ? "bg-primary/15" : "bg-transparent"
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-5 h-5 transition-colors duration-200",
                        isActive ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium leading-none transition-colors duration-200",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {t(key as Parameters<typeof t>[0])}
                  </span>
                </Link>
              </li>
            );
          })}

          {/* "More" button opens a drawer for the remaining routes */}
          <li className="flex-1">
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex flex-col items-center justify-center h-full gap-1 w-full"
            >
              <div
                className={cn(
                  "w-12 h-7 flex items-center justify-center rounded-full transition-all duration-200",
                  isMoreActive ? "bg-primary/15" : "bg-transparent"
                )}
              >
                <MoreHorizontal
                  className={cn(
                    "w-5 h-5 transition-colors duration-200",
                    isMoreActive ? "text-primary" : "text-muted-foreground"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium leading-none transition-colors duration-200",
                  isMoreActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {t("more")}
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} showStaff={showStaff} hiddenRoutes={hiddenRoutes} clinic={clinic} />
    </>
  );
}
