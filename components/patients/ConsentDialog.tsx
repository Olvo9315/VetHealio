"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CheckSquare, Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { getConsentText, recordConsent } from "@/lib/actions/consents";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SignaturePad, type SignaturePadHandle } from "@/components/common/SignaturePad";
import { cn } from "@/lib/utils";

const LANGS = ["es", "ru", "en"] as const;

// The owner reads the data-protection text on the clinic's phone or tablet, ticks what they agree to
// and signs with a finger (or, if they prefer, only ticks the box)
export function ConsentDialog({ ownerId, ownerName, open, onOpenChange }: { ownerId: string; ownerName: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations("consent");
  const router = useRouter();
  const uiLocale = useLocale();
  const [lang, setLang] = useState<string>(uiLocale);
  const [text, setText] = useState<string | null>(null);
  const [accept, setAccept] = useState(false);
  const [reminders, setReminders] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [method, setMethod] = useState<"SIGNATURE" | "CHECKBOX">("SIGNATURE");
  const [signed, setSigned] = useState(false);
  const pad = useRef<SignaturePadHandle>(null);
  const [isSaving, startSave] = useTransition();

  useEffect(() => {
    if (!open) return;
    setText(null);
    getConsentText(lang).then((r) => setText(r.text));
  }, [open, lang]);

  useEffect(() => {
    if (open) { setAccept(false); setReminders(true); setMarketing(false); setSigned(false); }
  }, [open]);

  const ready = accept && !!text && (method === "CHECKBOX" || signed);

  function save() {
    if (!text) return;
    const signature = method === "SIGNATURE" ? pad.current?.toDataUrl() ?? undefined : undefined;
    // The stored text says exactly what was accepted, including the optional choices
    const full = [
      text,
      "",
      `[x] ${t("acceptData")}`,
      `[${reminders ? "x" : " "}] ${t("acceptReminders")}`,
      `[${marketing ? "x" : " "}] ${t("acceptMarketing")}`,
    ].join("\n");
    startSave(async () => {
      const result = await recordConsent(ownerId, { text: full, method, signature, reminders, marketing });
      if ("error" in result) { toast.error(t("errorSave")); return; }
      toast.success(t("saved"));
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title", { name: ownerName })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground flex-1">{t("handDevice")}</p>
            <div className="flex rounded-md border p-0.5">
              {LANGS.map((l) => (
                <button key={l} type="button" onClick={() => setLang(l)} className={cn("px-2 h-7 text-xs font-medium rounded", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 max-h-56 overflow-y-auto text-sm whitespace-pre-line leading-relaxed">
            {text ?? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="space-y-2">
            <Check checked={accept} onChange={setAccept} label={t("acceptData")} required />
            <Check checked={reminders} onChange={setReminders} label={t("acceptReminders")} />
            <Check checked={marketing} onChange={setMarketing} label={t("acceptMarketing")} />
          </div>

          <div className="flex rounded-lg border p-0.5 bg-muted/40 w-fit">
            <button type="button" onClick={() => setMethod("SIGNATURE")} className={cn("flex items-center gap-1.5 px-3 h-8 text-sm rounded-md", method === "SIGNATURE" ? "bg-background shadow-sm font-medium" : "text-muted-foreground")}>
              <PenLine className="w-4 h-4" />{t("methodSignature")}
            </button>
            <button type="button" onClick={() => setMethod("CHECKBOX")} className={cn("flex items-center gap-1.5 px-3 h-8 text-sm rounded-md", method === "CHECKBOX" ? "bg-background shadow-sm font-medium" : "text-muted-foreground")}>
              <CheckSquare className="w-4 h-4" />{t("methodCheckbox")}
            </button>
          </div>
          {method === "SIGNATURE" && <SignaturePad ref={pad} onChange={(empty) => setSigned(!empty)} />}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button className="flex-1" disabled={!ready || isSaving} onClick={save}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("confirm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Check({ checked, onChange, label, required }: { checked: boolean; onChange: (v: boolean) => void; label: string; required?: boolean }) {
  return (
    <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
      <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{required && <span className="text-destructive"> *</span>}</span>
    </label>
  );
}
