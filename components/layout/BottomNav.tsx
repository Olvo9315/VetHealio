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
  Menu,
} from "lucide-react";

const mobileNav = [
  { href: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/patients", icon: PawPrint, key: "patients" },
  { href: "/appointments", icon: Calendar, key: "appointments" },
  { href: "/finances", icon: DollarSign, key: "finances" },
  { href: "/settings", icon: Menu, key: "settings" },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-bottom">
      <ul className="flex">
        {mobileNav.map(({ href, icon: Icon, key }) => {
          const isActive = pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center py-2 gap-1 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-none">
                  {t(key as Parameters<typeof t>[0])}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
