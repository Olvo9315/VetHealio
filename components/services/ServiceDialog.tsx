"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { createService, updateService } from "@/lib/actions/services";
import type { ServiceNode } from "@/lib/actions/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LANGUAGE_NAMES, useServicesContext, type DataLocale } from "./ServicesContext";

const PRESET_COLORS = [
  "#1D9E75", "#1D4ED8", "#15803D", "#B91C1C", "#7C3AED",
  "#0F766E", "#0369A1", "#6B7280", "#92400E", "#BE185D",
  "#D97706", "#0E7490", "#4D7C0F", "#7E22CE", "#DC2626",
];

interface ServiceDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentId?: string | null;
  parentName?: string;
  editNode?: ServiceNode;
  depth?: number;
}

export function ServiceDialog({
  open, onOpenChange, parentId, parentName, editNode, depth = 0,
}: ServiceDialogProps) {
  const t = useTranslations("services");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { dataLocale } = useServicesContext();
  // Languages other than the clinic's official one can get a display translation
  const otherLocales = (Object.keys(LANGUAGE_NAMES) as DataLocale[]).filter((l) => l !== dataLocale);
  const initialName = editNode?.officialName ?? editNode?.name ?? "";
  const initialTranslations = () => ({ ...(editNode?.translations ?? {}) }) as Partial<Record<DataLocale, string>>;

  const [name, setName] = useState(initialName);
  const [translations, setTranslations] = useState(initialTranslations);
  const [showTranslations, setShowTranslations] = useState(false);
  const [price, setPrice] = useState(editNode?.price != null ? String(editNode.price) : "");
  const [color, setColor] = useState(editNode?.color ?? PRESET_COLORS[0]);

  function reset() {
    setName(initialName);
    setTranslations(initialTranslations());
    setShowTranslations(otherLocales.some((l) => editNode?.translations?.[l]));
    setPrice(editNode?.price != null ? String(editNode.price) : "");
    setColor(editNode?.color ?? PRESET_COLORS[0]);
  }

  useEffect(() => {
    if (open) reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: name.trim(),
      price: price.trim() === "" ? null : Number(price),
      color: depth === 0 ? color : null,
      parentId: parentId ?? null,
      translations: Object.fromEntries(otherLocales.map((l) => [l, translations[l]?.trim() ?? ""])),
    };
    startTransition(async () => {
      const result = editNode
        ? await updateService(editNode.id, data)
        : await createService(data);
      if (result?.error) { toast.error(t("errorSave")); return; }
      toast.success(t("saved"));
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {editNode ? t("edit") : parentName ? `${t("addChild")}: ${parentName}` : t("newRoot")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>{t("officialName", { language: LANGUAGE_NAMES[dataLocale] })} *</Label>
            <div className="flex gap-2">
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("name")}
                autoFocus
              />
              <Button
                type="button"
                variant={showTranslations ? "secondary" : "outline"}
                size="icon"
                className="shrink-0"
                title={t("translate")}
                aria-label={t("translate")}
                onClick={() => setShowTranslations((v) => !v)}
              >
                <Languages className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("officialNameHint")}</p>
          </div>
          {showTranslations && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{t("translationsHint")}</p>
              {otherLocales.map((l) => (
                <div key={l} className="space-y-1">
                  <Label className="text-xs">{LANGUAGE_NAMES[l]}</Label>
                  <Input
                    value={translations[l] ?? ""}
                    onChange={(e) => setTranslations((prev) => ({ ...prev, [l]: e.target.value }))}
                    placeholder={name}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <Label>{t("price")}</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={t("noPrice")}
            />
          </div>
          {depth === 0 && (
            <div className="space-y-2">
              <Label>{t("color")}</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? "#000" : "transparent",
                    }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? tc("loading") : tc("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
