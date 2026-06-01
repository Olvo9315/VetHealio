"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ServiceFlat } from "@/lib/actions/services";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectedService = { id: string; name: string; price: number | null };

interface ServicePickerProps {
  services: ServiceFlat[];
  value: string | null;
  onChange: (service: SelectedService | null) => void;
  onAddNew: () => void;
  error?: string;
  compact?: boolean;
}

function buildLabel(id: string | null, services: ServiceFlat[]): string {
  if (!id) return "";
  const svc = services.find((s) => s.id === id);
  if (!svc) return "";
  const parts: string[] = [svc.name];
  let cur = svc;
  while (cur.parentId) {
    const parent = services.find((s) => s.id === cur.parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    cur = parent;
  }
  return parts.join(" › ");
}

export function ServicePicker({
  services, value, onChange, onAddNew, error, compact = false,
}: ServicePickerProps) {
  const t = useTranslations("services");

  const roots = services.filter((s) => s.parentId === null);
  const childrenOf = (id: string) => services.filter((s) => s.parentId === id);
  const isLeaf = (id: string) => childrenOf(id).length === 0;

  // Resolve initial state from value
  function resolveState(leafId: string | null) {
    if (!leafId) return { l1: null, l2: null, l3: null };
    const svc = services.find((s) => s.id === leafId);
    if (!svc) return { l1: null, l2: null, l3: null };
    if (!svc.parentId) return { l1: svc.id, l2: null, l3: null };
    const parent = services.find((s) => s.id === svc.parentId);
    if (!parent) return { l1: svc.id, l2: null, l3: null };
    if (!parent.parentId) return { l1: parent.id, l2: svc.id, l3: null };
    const grandparent = services.find((s) => s.id === parent.parentId);
    if (!grandparent) return { l1: parent.id, l2: svc.id, l3: null };
    return { l1: grandparent.id, l2: parent.id, l3: svc.id };
  }

  const initial = resolveState(value);
  const [l1, setL1] = useState<string | null>(initial.l1);
  const [l2, setL2] = useState<string | null>(initial.l2);
  const [l3, setL3] = useState<string | null>(initial.l3);

  useEffect(() => {
    const resolved = resolveState(value);
    setL1(resolved.l1);
    setL2(resolved.l2);
    setL3(resolved.l3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleL1(id: string | null) {
    if (!id) return;
    setL1(id); setL2(null); setL3(null);
    if (isLeaf(id)) {
      const svc = services.find((s) => s.id === id)!;
      onChange({ id: svc.id, name: buildLabel(svc.id, services), price: svc.price });
    } else {
      onChange(null);
    }
  }

  function handleL2(id: string | null) {
    if (!id) return;
    setL2(id); setL3(null);
    if (isLeaf(id)) {
      const svc = services.find((s) => s.id === id)!;
      onChange({ id: svc.id, name: buildLabel(svc.id, services), price: svc.price });
    } else {
      onChange(null);
    }
  }

  function handleL3(id: string | null) {
    if (!id) return;
    setL3(id);
    const svc = services.find((s) => s.id === id)!;
    onChange({ id: svc.id, name: buildLabel(svc.id, services), price: svc.price });
  }

  const l2Options = l1 ? childrenOf(l1) : [];
  const l3Options = l2 ? childrenOf(l2) : [];

  const triggerClass = compact ? "h-8 text-xs" : undefined;

  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      {/* Level 1 */}
      <Select value={l1 ?? ""} onValueChange={handleL1}>
        <SelectTrigger className={cn(error && "border-destructive", triggerClass)}>
          <SelectValue placeholder={t("category")}>
            {l1 ? services.find((s) => s.id === l1)?.name : <span className="text-muted-foreground">{t("category")}</span>}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {roots.map((s) => (
            <SelectItem key={s.id} value={s.id} className={compact ? "text-xs" : undefined}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Level 2 */}
      {l2Options.length > 0 && (
        <Select value={l2 ?? ""} onValueChange={handleL2}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder={t("subtype")}>
              {l2 ? services.find((s) => s.id === l2)?.name : <span className="text-muted-foreground">{t("subtype")}</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {l2Options.map((s) => (
              <SelectItem key={s.id} value={s.id} className={compact ? "text-xs" : undefined}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Level 3 */}
      {l3Options.length > 0 && (
        <Select value={l3 ?? ""} onValueChange={handleL3}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder={t("item")}>
              {l3 ? services.find((s) => s.id === l3)?.name : <span className="text-muted-foreground">{t("item")}</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {l3Options.map((s) => (
              <SelectItem key={s.id} value={s.id} className={compact ? "text-xs" : undefined}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("h-7 px-2 text-xs text-muted-foreground hover:text-foreground", compact && "h-6")}
        onClick={onAddNew}
      >
        <Plus className="h-3 w-3 mr-1" />
        {t("addNew")}
      </Button>
    </div>
  );
}
