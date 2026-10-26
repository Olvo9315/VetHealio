"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Blocks, CheckCircle2, Clock, KeyRound, Loader2, Lock } from "lucide-react";
import type { ModuleKey } from "@/lib/modules";
import { updateLicenseKey } from "@/lib/actions/clinic";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ModuleRow = { key: ModuleKey; enabled: boolean; planned: boolean };

interface ModulesCardProps {
  modules: ModuleRow[];
  licenseStatus: "none" | "valid" | "expired" | "invalid";
  expiresAt?: string;
}

export function ModulesCard({ modules, licenseStatus, expiresAt }: ModulesCardProps) {
  const t = useTranslations("modules");
  const router = useRouter();
  const [showKey, setShowKey] = useState(false);
  const [key, setKey] = useState("");
  const [isSaving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      const result = await updateLicenseKey(key);
      if ("error" in result) {
        toast.error(t("invalidLicense"));
        return;
      }
      toast.success(t("licenseSaved"));
      setKey("");
      setShowKey(false);
      router.refresh();
    });
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Blocks className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold flex-1">{t("title")}</h2>
        <span className="text-xs text-muted-foreground">
          {t(`license.${licenseStatus}`, { date: expiresAt ? expiresAt.slice(0, 10) : "" })}
        </span>
      </div>

      <ul className="divide-y divide-border">
        {modules.map((m) => (
          <li key={m.key} className="flex items-start gap-3 py-2.5">
            {m.enabled ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            ) : m.planned ? (
              <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            ) : (
              <Lock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium", !m.enabled && "text-muted-foreground")}>{t(`names.${m.key}`)}</p>
              <p className="text-xs text-muted-foreground">{t(`descriptions.${m.key}`)}</p>
            </div>
            <span
              className={cn(
                "text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0",
                m.enabled
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {m.enabled ? t("enabled") : m.planned ? t("comingSoon") : t("notIncluded")}
            </span>
          </li>
        ))}
      </ul>

      {showKey ? (
        <div className="space-y-2">
          <Textarea
            rows={3}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t("keyPlaceholder")}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowKey(false)}>
              {t("cancel")}
            </Button>
            <Button type="button" size="sm" className="bg-primary text-primary-foreground" disabled={isSaving} onClick={save}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("applyKey")}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowKey(true)}>
          <KeyRound className="w-4 h-4 mr-2" />
          {t("enterKey")}
        </Button>
      )}
    </div>
  );
}
