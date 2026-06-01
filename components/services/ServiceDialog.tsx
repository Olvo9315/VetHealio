"use client";

import { useState, useTransition } from "react";
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
  const [name, setName] = useState(editNode?.name ?? "");
  const [price, setPrice] = useState(editNode?.price != null ? String(editNode.price) : "");
  const [color, setColor] = useState(editNode?.color ?? PRESET_COLORS[0]);

  function reset() {
    setName(editNode?.name ?? "");
    setPrice(editNode?.price != null ? String(editNode.price) : "");
    setColor(editNode?.color ?? PRESET_COLORS[0]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: name.trim(),
      price: price.trim() === "" ? null : Number(price),
      color: depth === 0 ? color : null,
      parentId: parentId ?? null,
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
            <Label>{t("name")} *</Label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("name")}
              autoFocus
            />
          </div>
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
