"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updatePreferences } from "@/lib/actions/settings";
import { toast } from "sonner";
import { Loader2, Settings, Sun, Moon, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

type Lang = "es" | "ru" | "en";
type Theme = "light" | "dark";

interface PreferencesCardProps {
  userId: string;
  initialLanguage: string;
  initialTheme: string;
}

export function PreferencesCard({ userId, initialLanguage, initialTheme }: PreferencesCardProps) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [lang, setLang] = useState<Lang>((initialLanguage as Lang) ?? "es");
  const [theme, setTheme] = useState<Theme>((initialTheme as Theme) ?? "light");
  const [isSaving, startSave] = useTransition();

  const LANGUAGES: { value: Lang; label: string; flag: string }[] = [
    { value: "es", label: t("es"), flag: "🇪🇸" },
    { value: "ru", label: t("ru"), flag: "🇷🇺" },
    { value: "en", label: t("en"), flag: "🇬🇧" },
  ];

  function applyTheme(newTheme: Theme) {
    setTheme(newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
    document.cookie = `theme=${newTheme}; path=/; max-age=31536000; SameSite=Lax`;
  }

  function applyLang(newLang: Lang) {
    setLang(newLang);
    document.cookie = `locale=${newLang}; path=/; max-age=31536000; SameSite=Lax`;
  }

  function handleSave() {
    startSave(async () => {
      const result = await updatePreferences(userId, { language: lang, theme });
      if ("error" in result) {
        toast.error(t("errorPreferences"));
        return;
      }
      toast.success(t("preferencesUpdated"));
      router.refresh();
    });
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{t("preferences")}</h2>
      </div>

      {/* Theme */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sun className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium">{t("theme")}</p>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["light", "dark"] as const).map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => applyTheme(th)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors",
                theme === th
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {th === "light" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {th === "light" ? t("light") : t("dark")}
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium">{t("language")}</p>
        </div>
        <div className="flex flex-col gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => applyLang(l.value)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors text-sm",
                lang === l.value
                  ? "border-primary bg-primary/5 text-foreground font-medium"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              <span className="text-lg leading-none">{l.flag}</span>
              <span>{l.label}</span>
              {lang === l.value && (
                <span className="ml-auto w-2 h-2 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors",
          "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        )}
      >
        {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
        {t("savePreferences")}
      </button>
    </div>
  );
}
