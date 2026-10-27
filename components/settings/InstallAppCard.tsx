"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canInstall, isInstalled, isIos, promptInstall, subscribeInstall } from "@/lib/pwa-install";

type State = "installed" | "available" | "ios" | "unavailable";

function currentState(): State {
  if (isInstalled()) return "installed";
  if (canInstall()) return "available";
  if (isIos()) return "ios";
  return "unavailable";
}

// Always-available way to install the app (the banner only appears now and then)
export function InstallAppCard() {
  const t = useTranslations("pwa");
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    setState(currentState());
    return subscribeInstall(() => setState(currentState()));
  }, []);

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Smartphone className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{t("cardTitle")}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{t("installDesc")}</p>

      {state === "installed" && (
        <p className="flex items-center gap-2 text-sm text-primary font-medium">
          <CheckCircle2 className="w-4 h-4" /> {t("installed")}
        </p>
      )}
      {state === "available" && (
        <Button size="sm" onClick={() => promptInstall()}>
          <Download className="w-4 h-4 mr-1.5" />
          {t("installTitle")}
        </Button>
      )}
      {state === "ios" && (
        <p className="text-sm flex items-start gap-2">
          <Share className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
          {t("iosHint")}
        </p>
      )}
      {state === "unavailable" && <p className="text-sm text-muted-foreground">{t("unavailableHint")}</p>}
    </div>
  );
}
