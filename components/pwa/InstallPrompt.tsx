"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, X } from "lucide-react";
import {
  bannerAllowed,
  canInstall,
  isInstalled,
  markBannerDismissed,
  markBannerShown,
  promptInstall,
  subscribeInstall,
} from "@/lib/pwa-install";

// Shown a few seconds after the browser offers installation, at most once a day,
// and not again for two weeks after "Later". Settings always has an install button.
const SHOW_DELAY_MS = 8000;

export function InstallPrompt() {
  const t = useTranslations("pwa");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isInstalled()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (!canInstall()) {
        setVisible(false);
        return;
      }
      if (timer || !bannerAllowed()) return;
      timer = setTimeout(() => {
        if (canInstall() && bannerAllowed()) {
          markBannerShown();
          setVisible(true);
        }
      }, SHOW_DELAY_MS);
    };
    check();
    const unsubscribe = subscribeInstall(check);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function handleInstall() {
    setVisible(false);
    await promptInstall();
  }

  function handleLater() {
    markBannerDismissed();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="banner"
      className="fixed bottom-20 md:bottom-4 left-3 right-3 md:left-auto md:right-4 md:max-w-sm z-50 vh-pop-in"
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
            onClick={handleLater}
            aria-label={t("later")}
            title={t("later")}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
