"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Copy, Link2, Loader2, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { createConsentRequest } from "@/lib/actions/consents";
import { Button } from "@/components/ui/button";

type Input = Parameters<typeof createConsentRequest>[1];

// Instead of signing here, send the document to the owner's phone: a private link by WhatsApp or
// e-mail that they open, read and sign with their finger. The document appears as signed when done.
export function SendSignLink({ ownerId, input, disabled, onSent }: { ownerId: string; input: () => Input | null; disabled?: boolean; onSent?: () => void }) {
  const t = useTranslations("consent");
  const router = useRouter();
  const [link, setLink] = useState<Awaited<ReturnType<typeof createConsentRequest>> | null>(null);
  const [isBusy, startBusy] = useTransition();

  function create() {
    const data = input();
    if (!data) return;
    startBusy(async () => {
      setLink(await createConsentRequest(ownerId, data));
      router.refresh();
    });
  }

  if (!link) {
    return (
      <Button type="button" variant="outline" className="w-full gap-1.5" disabled={disabled || isBusy} onClick={create}>
        {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
        {t("sendLink")}
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <p className="text-sm font-medium">{t("linkReady")}</p>
      <p className="text-xs text-muted-foreground break-all">{link.url}</p>
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          size="sm"
          className="gap-1.5 bg-[#25D366] hover:bg-[#1fb257] text-white"
          onClick={() => {
            window.open(link.whatsapp ? `https://wa.me/${link.whatsapp}?text=${encodeURIComponent(link.message)}` : `https://wa.me/?text=${encodeURIComponent(link.message)}`, "_blank");
            onSent?.();
          }}
        >
          <MessageCircle className="w-4 h-4" />WhatsApp
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 bg-background"
          onClick={() => {
            window.location.href = `mailto:${link.email ?? ""}?subject=${encodeURIComponent(link.subject)}&body=${encodeURIComponent(link.message)}`;
            onSent?.();
          }}
        >
          <Mail className="w-4 h-4" />Email
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 bg-background"
          onClick={async () => {
            await navigator.clipboard.writeText(link.message);
            toast.success(t("linkCopied"));
          }}
        >
          <Copy className="w-4 h-4" />{t("copy")}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("linkHint")}</p>
    </div>
  );
}
