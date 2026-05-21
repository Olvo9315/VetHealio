"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const t = useTranslations("pwa");
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setVisible(false);
    setPrompt(null);
  }

  if (!visible) return null;

  return (
    <div
      role="banner"
      className="fixed bottom-20 md:bottom-4 left-3 right-3 md:left-auto md:right-4 md:max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-300"
    >
      <div className="bg-card border border-border rounded-2xl shadow-lg p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">{t("installTitle")}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{t("installDesc")}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold active:scale-95 transition-transform"
          >
            {t("install")}
          </button>
          <button
            onClick={() => setVisible(false)}
            aria-label={t("later")}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
