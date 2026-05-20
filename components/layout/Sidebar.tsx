"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  PawPrint,
  Calendar,
  FileText,
  DollarSign,
  Package,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Heart,
} from "lucide-react";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { href: "/patients", icon: PawPrint, key: "patients" },
  { href: "/appointments", icon: Calendar, key: "appointments" },
  { href: "/medical-records", icon: FileText, key: "medicalRecords" },
  { href: "/finances", icon: DollarSign, key: "finances" },
  { href: "/inventory", icon: Package, key: "inventory" },
  { href: "/settings", icon: Settings, key: "settings" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <TooltipProvider delay={0}>
      <aside
        className={cn(
          "hidden md:flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Heart className="w-4 h-4 text-primary-foreground" />
            </div>
            {!collapsed && (
              <span className="font-bold text-lg text-sidebar-foreground truncate">
                VetHealio
              </span>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-2">
            {navItems.map(({ href, icon: Icon, key }) => {
              const isActive = pathname.startsWith(href);
              return (
                <li key={href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger
                        className={cn(
                          "flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <Link href={href} className="flex items-center justify-center w-full h-full">
                          <Icon className="w-5 h-5" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {t(key as Parameters<typeof t>[0])}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Link
                      href={href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {t(key as Parameters<typeof t>[0])}
                      </span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Logout + collapse */}
        <div className="border-t border-sidebar-border p-2 space-y-1">
          {collapsed ? (
            <>
              <Tooltip>
                <TooltipTrigger className="w-10 h-10 mx-auto flex items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  <LogOut className="w-4 h-4" />
                </TooltipTrigger>
                <TooltipContent side="right">{t("logout")}</TooltipContent>
              </Tooltip>
              <button
                className="w-10 h-10 mx-auto flex items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                onClick={() => setCollapsed(false)}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">{t("logout")}</span>
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-end text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={() => setCollapsed(true)}
              >
                <span className="text-sm mr-1">Colapsar</span>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
