"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { FileText, Package, Settings, X, LogOut, Heart, Users } from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect } from "react";

const extraNav = [
  { href: "/medical-records", icon: FileText, key: "medicalRecords" },
  { href: "/inventory", icon: Package, key: "inventory" },
  { href: "/settings", icon: Settings, key: "settings" },
] as const;

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  showStaff?: boolean;
}

export function MobileDrawer({ open, onClose, showStaff }: MobileDrawerProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  // Close on route change
  useEffect(() => {
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-2xl",
          "transition-transform duration-300 ease-out safe-area-bottom",
          open ? "translate-y-0" : "translate-y-full"
        )}
        role="dialog"
        aria-modal="true"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Heart className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">VetHealio</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="p-4 space-y-1">
          {extraNav.map(({ href, icon: Icon, key }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-muted"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-sm">{t(key as Parameters<typeof t>[0])}</span>
              </Link>
            );
          })}
          {showStaff && (
            <Link
              href="/staff"
              className={cn(
                "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors",
                pathname.startsWith("/staff")
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <Users className="w-5 h-5 shrink-0" />
              <span className="text-sm">{t("staff")}</span>
            </Link>
          )}
        </nav>

        {/* Logout */}
        <div className="px-4 pb-4 border-t border-border pt-3">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl w-full text-left text-destructive hover:bg-destructive/5 transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium">{t("logout")}</span>
          </button>
        </div>
      </div>
    </>
  );
}
