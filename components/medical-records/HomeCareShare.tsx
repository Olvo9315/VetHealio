"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Copy, Home, Loader2, Mail, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { getHomeCareMessage } from "@/lib/actions/documents";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LANGS = ["es", "ru", "en"] as const;

// Give the owner their home-care instructions: print / PDF, WhatsApp, e-mail or copy, in their language
// `prepare` runs first (e.g. saves the record being edited, so what is sent is what is on screen) and
// returns the record id to send, or null to stop
export function HomeCareShare({
  recordId,
  prepare,
  embedded,
  className,
}: {
  recordId?: string;
  prepare?: () => Promise<string | null>;
  // Inside the record form, right under the text: no second box, buttons two by two
  embedded?: boolean;
  className?: string;
}) {
  const t = useTranslations("medicalRecords");
  const uiLocale = useLocale();
  const [lang, setLang] = useState<string>(LANGS.includes(uiLocale as never) ? uiLocale : "es");
  const [busy, startBusy] = useTransition();

  function withMessage(fn: (m: NonNullable<Awaited<ReturnType<typeof getHomeCareMessage>>>) => void) {
    startBusy(async () => {
      const id = prepare ? await prepare() : recordId;
      if (!id) return;
      const message = await getHomeCareMessage(id, lang);
      if (message) fn(message);
    });
  }

  return (
    <div className={cn(embedded ? "space-y-2 pt-1" : "rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2", className)}>
      <div className="flex items-center gap-2">
        {!embedded && <Home className="w-4 h-4 text-primary" />}
        <p className={cn("flex-1 min-w-0", embedded ? "text-xs text-muted-foreground" : "text-sm font-medium")}>{embedded ? t("homeCareSendShort") : t("homeCareSend")}</p>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        <div className="flex rounded-md border bg-background p-0.5">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn("px-1.5 h-6 text-[11px] font-medium rounded", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className={cn("grid grid-cols-2 gap-2 [&>button]:min-w-0", !embedded && "sm:grid-cols-4")}>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 bg-background" disabled={busy}
          onClick={() => {
            if (!prepare) { window.open(`/print/home-care/${recordId}?lang=${lang}`, "_blank"); return; }
            // Open the tab now (inside the click, so it is not blocked) and point it at the print once saved
            const w = window.open("about:blank", "_blank");
            startBusy(async () => {
              const id = await prepare();
              if (!id) { w?.close(); return; }
              if (w) w.location.href = `/print/home-care/${id}?lang=${lang}`;
            });
          }}>
          <Printer className="w-4 h-4" />
          {t("homeCarePrint")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 bg-background"
          disabled={busy}
          onClick={() =>
            withMessage((m) => {
              const url = m.whatsapp
                ? `https://wa.me/${m.whatsapp}?text=${encodeURIComponent(m.text)}`
                : `https://wa.me/?text=${encodeURIComponent(m.text)}`;
              window.open(url, "_blank");
            })
          }
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 bg-background"
          disabled={busy}
          onClick={() =>
            withMessage((m) => {
              if (!m.email) toast.info(t("homeCareNoEmail"));
              window.location.href = `mailto:${m.email ?? ""}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}`;
            })
          }
        >
          <Mail className="w-4 h-4" />
          Email
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 bg-background"
          disabled={busy}
          onClick={() =>
            withMessage(async (m) => {
              await navigator.clipboard.writeText(m.text);
              toast.success(t("homeCareCopied"));
            })
          }
        >
          <Copy className="w-4 h-4" />
          {t("homeCareCopy")}
        </Button>
      </div>
    </div>
  );
}
