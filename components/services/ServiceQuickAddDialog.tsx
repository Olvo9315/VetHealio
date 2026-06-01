"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createService } from "@/lib/actions/services";
import type { ServiceFlat, SelectedService } from "@/lib/actions/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface ServiceQuickAddDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  services: ServiceFlat[];
  onCreated: (service: SelectedService) => void;
}

export function ServiceQuickAddDialog({
  open, onOpenChange, services, onCreated,
}: ServiceQuickAddDialogProps) {
  const t = useTranslations("services");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [parentId, setParentId] = useState<string>("");

  function reset() { setName(""); setPrice(""); setParentId(""); }

  // Build flat list with indented labels for the parent selector
  const roots = services.filter((s) => s.parentId === null);
  const level1 = services.filter((s) => s.parentId !== null && !services.some((p) => p.id === s.parentId && p.parentId !== null));
  const parentOptions = [
    ...roots.map((s) => ({ id: s.id, label: s.name })),
    ...level1.map((s) => {
      const parent = services.find((p) => p.id === s.parentId);
      return { id: s.id, label: `${parent?.name ?? ""} › ${s.name}` };
    }),
  ];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: name.trim(),
      price: price.trim() === "" ? null : Number(price),
      parentId: parentId || null,
      color: null,
    };
    startTransition(async () => {
      const result = await createService(data);
      if (result?.error) { toast.error(t("errorSave")); return; }
      const created = result.service!;
      toast.success(t("saved"));
      onCreated({ id: created.id, name: created.name, price: created.price });
      reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("addNew")}</DialogTitle>
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
          {parentOptions.length > 0 && (
            <div className="space-y-1">
              <Label>Categoría padre</Label>
              <Select value={parentId} onValueChange={(v) => setParentId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="(Raíz)">
                    {parentId
                      ? parentOptions.find((o) => o.id === parentId)?.label
                      : <span className="text-muted-foreground">(Raíz)</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">(Raíz)</SelectItem>
                  {parentOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
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
