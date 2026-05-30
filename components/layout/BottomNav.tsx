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
} from "lucide-react";
import { useState } from "react";
import { MobileDrawer } from "@/components/layout/MobileDrawer";

const primaryNav = [
  { href: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/patients", icon: PawPrint, key: "patients" },
  { href: "/appointments", icon: Calendar, key: "appointments" },
  { href: "/finances", icon: DollarSign, key: "finances" },
];

interface BottomNavProps {
  showStaff?: boolean;
}

export function BottomNav({ showStaff }: BottomNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isMoreActive = ["/medical-records", "/inventory", "/settings", ...(showStaff ? ["/staff"] : [])].some((p) =>
    pathname.startsWith(p)
  );

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border safe-area-bottom">
        <ul className="flex h-16">
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
                Más
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} showStaff={showStaff} />
    </>
  );
}
