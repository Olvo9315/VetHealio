"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Pill, Pencil, Trash2, Loader2, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { deletePrescription } from "@/lib/actions/prescriptions";
import type { PrescriptionFull } from "@/lib/actions/prescriptions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn, formatPrescriptionId } from "@/lib/utils";

interface PrescriptionsListProps {
  prescriptions: PrescriptionFull[];
  onEdit: (p: PrescriptionFull) => void;
}

export function PrescriptionsList({ prescriptions, onEdit }: PrescriptionsListProps) {
  const t = useTranslations("prescriptions");
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [, startDelete] = useTransition();

  if (prescriptions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Pill className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">{t("noPrescriptions")}</p>
      </div>
    );
  }

  function handleDelete(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    setDeletingId(id);
    startDelete(async () => {
      await deletePrescription(id);
      toast.success(t("deleted"));
      setDeletingId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {prescriptions.map((p) => {
        const hasItems = p.items && p.items.length > 0;
        const isExpanded = expandedId === p.id;

        // Legacy (from medical record): no items, use old fields
        const isLegacy = !hasItems;

        return (
          <div key={p.id} className="bg-card border border-border rounded-lg overflow-hidden">
            {/* Header row */}
            <div className="flex items-start gap-3 p-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
                <Pill className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-medium text-sm">
                    {hasItems
                      ? `${p.items.length} medicamento${p.items.length !== 1 ? "s" : ""}`
                      : (p as unknown as { medicationName?: string }).medicationName ?? "Receta"}
                  </p>
                  <span className="text-xs font-mono text-muted-foreground">{formatPrescriptionId(p.number)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(p.createdAt), "dd MMM yyyy")}
                  {p.veterinarian && ` · Dr. ${p.veterinarian.name}`}
                </p>
                {p.appointment && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Calendar className="w-3 h-3" />
                    <span>{p.appointment.title}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {hasItems && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  >
                    {isExpanded
                      ? <ChevronUp className="w-3.5 h-3.5" />
                      : <ChevronDown className="w-3.5 h-3.5" />}
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(p)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(p.id)}
                  disabled={deletingId === p.id}
                >
                  {deletingId === p.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            {/* Expanded items */}
            {hasItems && isExpanded && (
              <div className="border-t border-border divide-y divide-border">
                {p.items.map((item, idx) => (
                  <div key={item.id} className="px-4 py-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Medicamento {idx + 1}
                    </p>
                    <p className="font-medium text-sm">{item.medicationName}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {item.activeIngredient && (
                        <span><span className="font-medium text-foreground">Principio activo:</span> {item.activeIngredient}</span>
                      )}
                      {item.units && (
                        <span><span className="font-medium text-foreground">Unidades:</span> {item.units}</span>
                      )}
                      <span className="col-span-2">
                        <span className="font-medium text-foreground">Posología:</span> {item.posology}
                      </span>
                      {item.indications && (
                        <span className="col-span-2">
                          <span className="font-medium text-foreground">Indicaciones:</span> {item.indications}
                        </span>
                      )}
                      {item.warnings && (
                        <span className={cn("col-span-2 text-amber-600 dark:text-amber-400")}>
                          ⚠ {item.warnings}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {p.notes && (
                  <div className="px-4 py-2 text-xs text-muted-foreground">
                    {p.notes}
                  </div>
                )}
              </div>
            )}

            {/* Legacy preview (from medical record, no items) */}
            {isLegacy && (
              <div className="border-t border-border px-4 py-2 flex flex-wrap gap-2">
                {(p as unknown as { dosage?: string }).dosage && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                    {(p as unknown as { dosage?: string }).dosage}
                  </span>
                )}
                {(p as unknown as { frequency?: string }).frequency && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                    {(p as unknown as { frequency?: string }).frequency}
                  </span>
                )}
                {(p as unknown as { duration?: string }).duration && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                    {(p as unknown as { duration?: string }).duration}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
