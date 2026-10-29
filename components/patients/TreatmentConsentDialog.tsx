"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, PenLine, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { getConsentVets, getTreatmentConsentText, recordConsent } from "@/lib/actions/consents";
import { CONSENT_FIELDS, TREATMENT_CONSENTS, type ConsentDetails, type TreatmentConsentKind } from "@/lib/consents";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad, type SignaturePadHandle } from "@/components/common/SignaturePad";
import { SendSignLink } from "./SendSignLink";
import { cn } from "@/lib/utils";

const LANGS = ["es", "ru", "en"] as const;
type Pet = { id: string; name: string };
type Vet = { id: string; name: string; license: string };

// Informed consent for a veterinary act, signed by the owner (or a person they authorise) for one or
// several of their pets at once. The vet fills in what will be done, the risks and the cost; the owner
// reads the full text in their language and signs on the screen.
export function TreatmentConsentDialog({
  ownerId,
  ownerName,
  pets,
  presetPetIds,
  presetKind = "general",
  open,
  onOpenChange,
}: {
  ownerId: string;
  ownerName: string;
  pets: Pet[];
  presetPetIds?: string[];
  presetKind?: TreatmentConsentKind;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("consent");
  const router = useRouter();
  const uiLocale = useLocale();
  const [step, setStep] = useState<"fill" | "sign">("fill");
  const [kind, setKind] = useState<TreatmentConsentKind>(presetKind);
  const [petIds, setPetIds] = useState<string[]>(presetPetIds ?? pets.map((p) => p.id).slice(0, 1));
  const [details, setDetails] = useState<ConsentDetails>({});
  const [vets, setVets] = useState<Vet[]>([]);
  const [vetId, setVetId] = useState("");
  const [signer, setSigner] = useState("");
  const [lang, setLang] = useState<string>(uiLocale);
  const [text, setText] = useState<string | null>(null);
  const [accept, setAccept] = useState(false);
  const [method, setMethod] = useState<"SIGNATURE" | "CHECKBOX">("SIGNATURE");
  const [signed, setSigned] = useState(false);
  const pad = useRef<SignaturePadHandle>(null);
  const [isBusy, startBusy] = useTransition();

  useEffect(() => {
    if (!open) return;
    setStep("fill");
    setKind(presetKind);
    setPetIds(presetPetIds ?? pets.map((p) => p.id).slice(0, 1));
    setDetails({});
    setSigner("");
    setAccept(false);
    setSigned(false);
    getConsentVets().then((v) => {
      setVets(v);
      setVetId((cur) => cur || v[0]?.id || "");
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const vet = vets.find((v) => v.id === vetId);
  const fields = CONSENT_FIELDS[kind];
  const set = (k: keyof ConsentDetails, v: string) => setDetails((d) => ({ ...d, [k]: v }));
  const fullDetails = (): Record<string, string> => {
    const out: Record<string, string> = { vetName: vet?.name ?? "", vetLicense: vet?.license ?? "" };
    for (const [k, v] of Object.entries(details)) if (v) out[k] = String(v);
    return out;
  };

  function loadText(l = lang) {
    startBusy(async () => {
      const r = await getTreatmentConsentText(ownerId, { kind, petIds, details: fullDetails(), signerName: signer, lang: l });
      setText(r.text);
    });
  }

  function toSign() {
    setText(null);
    setStep("sign");
    loadText();
  }

  function save() {
    if (!text) return;
    const signature = method === "SIGNATURE" ? pad.current?.toDataUrl() ?? undefined : undefined;
    startBusy(async () => {
      // The language it was read and signed in, so the copy prints in it
      const result = await recordConsent(ownerId, { kind, text, method, signature, petIds, details: { ...fullDetails(), lang }, signerName: signer || undefined });
      if ("error" in result) { toast.error(t("errorSave")); return; }
      toast.success(t("saved"));
      onOpenChange(false);
      window.open(`/print/consent/${result.consent.id}`, "_blank");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("treatmentTitle", { name: ownerName })}</DialogTitle>
        </DialogHeader>

        {step === "fill" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("kindLabel")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {TREATMENT_CONSENTS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn("px-3 h-8 rounded-full text-sm border", kind === k ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted")}
                  >
                    {t(`kind_${k}`)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t(`kindHint_${kind}`)}</p>
            </div>

            <div className="space-y-1.5">
              <Label>{t("petsLabel")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {pets.map((p) => {
                  const on = petIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPetIds((ids) => (on ? ids.filter((i) => i !== p.id) : [...ids, p.id]))}
                      className={cn("px-3 h-8 rounded-full text-sm border", on ? "bg-primary/15 border-primary text-primary font-medium" : "text-muted-foreground hover:bg-muted")}
                    >
                      {on ? "✓ " : ""}{p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {fields.includes("procedure") && (
              <div className="space-y-1">
                <Label>{t(kind === "euthanasia" || kind === "necropsy" ? "reasonLabel" : "procedureLabel")}</Label>
                <Textarea rows={2} value={details.procedure ?? ""} onChange={(e) => set("procedure", e.target.value)} placeholder={t(`procedurePlaceholder_${kind}`)} />
              </div>
            )}
            {fields.includes("risks") && (
              <div className="space-y-1">
                <Label>{t("risksLabel")}</Label>
                <Textarea rows={2} value={details.risks ?? ""} onChange={(e) => set("risks", e.target.value)} placeholder={t("risksPlaceholder")} />
              </div>
            )}
            {fields.includes("alternatives") && (
              <div className="space-y-1">
                <Label>{t("alternativesLabel")}</Label>
                <Textarea rows={2} value={details.alternatives ?? ""} onChange={(e) => set("alternatives", e.target.value)} placeholder={t("alternativesPlaceholder")} />
              </div>
            )}
            {fields.includes("bodyDestination") && (
              <div className="space-y-1">
                <Label>{t("bodyLabel")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(["individual", "collective", "home"] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => set("bodyDestination", b)}
                      className={cn("px-3 h-8 rounded-full text-sm border", details.bodyDestination === b ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted")}
                    >
                      {t(`body_${b}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.includes("cost") && (
                <div className="space-y-1">
                  <Label>{t("costLabel")}</Label>
                  <Input value={details.cost ?? ""} onChange={(e) => set("cost", e.target.value)} placeholder={t("costPlaceholder")} />
                </div>
              )}
              <div className="space-y-1">
                <Label>{t("vetLabel")}</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={vetId} onChange={(e) => setVetId(e.target.value)}>
                  {vets.map((v) => <option key={v.id} value={v.id}>{v.name}{v.license ? ` · ${v.license}` : ""}</option>)}
                </select>
                {vet && !vet.license && <p className="text-[11px] text-amber-600">{t("noLicense")}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t("signerLabel")}</Label>
              <Input value={signer} onChange={(e) => setSigner(e.target.value)} placeholder={t("signerPlaceholder", { name: ownerName })} />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
              <Button className="flex-1" disabled={!petIds.length || (fields.includes("procedure") && !details.procedure?.trim())} onClick={toSign}>
                {t("toSigning")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground flex-1">{t("handDevice")}</p>
              <div className="flex rounded-md border p-0.5">
                {LANGS.map((l) => (
                  <button key={l} type="button" onClick={() => { setLang(l); setText(null); loadText(l); }} className={cn("px-2 h-7 text-xs font-medium rounded", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 max-h-64 overflow-y-auto text-sm whitespace-pre-line leading-relaxed">
              {text ?? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
              <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0 accent-primary" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              <span>{t("acceptTreatment")}<span className="text-destructive"> *</span></span>
            </label>
            <div className="flex rounded-lg border p-0.5 bg-muted/40 w-fit">
              <button type="button" onClick={() => setMethod("SIGNATURE")} className={cn("flex items-center gap-1.5 px-3 h-8 text-sm rounded-md", method === "SIGNATURE" ? "bg-background shadow-sm font-medium" : "text-muted-foreground")}>
                <PenLine className="w-4 h-4" />{t("methodSignature")}
              </button>
              <button type="button" onClick={() => setMethod("CHECKBOX")} className={cn("flex items-center gap-1.5 px-3 h-8 text-sm rounded-md", method === "CHECKBOX" ? "bg-background shadow-sm font-medium" : "text-muted-foreground")}>
                <CheckSquare className="w-4 h-4" />{t("methodCheckbox")}
              </button>
            </div>
            {method === "CHECKBOX" && kind !== "general" && <p className="text-xs text-amber-700 dark:text-amber-400">{t("signatureRecommended")}</p>}
            {method === "SIGNATURE" && <SignaturePad ref={pad} onChange={(empty) => setSigned(!empty)} />}
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs text-muted-foreground">{t("orSendLink")}</p>
              <SendSignLink
                ownerId={ownerId}
                disabled={!text}
                input={() =>
                  text
                    ? { kind, text, lang: lang as "es" | "ru" | "en", petIds, details: fullDetails(), signerName: signer || undefined }
                    : null
                }
                onSent={() => onOpenChange(false)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("fill")}>{t("back")}</Button>
              <Button className="flex-1" disabled={!accept || !text || isBusy || (method === "SIGNATURE" && !signed)} onClick={save}>
                {isBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t("confirm")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
