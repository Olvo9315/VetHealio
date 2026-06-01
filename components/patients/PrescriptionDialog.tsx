"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { createPrescription, updatePrescription } from "@/lib/actions/prescriptions";
import type { PrescriptionFull, PrescriptionItemData } from "@/lib/actions/prescriptions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, Trash2, Pill } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PrescriptionDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  petId: string;
  petName: string;
  veterinarianId?: string;
  appointmentId?: string;
  appointmentTitle?: string;
  record?: PrescriptionFull;
  onSaved: (p: PrescriptionFull) => void;
}

type ItemState = PrescriptionItemData & { _key: number };

function emptyItem(key: number): ItemState {
  return {
    _key: key,
    medicationName: "",
    units: "",
    activeIngredient: "",
    posology: "",
    indications: "",
    warnings: "",
  };
}

let _seq = 0;
function nextKey() { return ++_seq; }

export function PrescriptionDialog({
  open,
  onOpenChange,
  petId,
  petName,
  veterinarianId,
  appointmentId,
  appointmentTitle,
  record,
  onSaved,
}: PrescriptionDialogProps) {
  const t = useTranslations("prescriptions");
  const tc = useTranslations("common");
  const [isSaving, startSave] = useTransition();

  const isEdit = !!record;

  const [notes, setNotes] = useState(record?.notes ?? "");
  function mapItems(src: PrescriptionFull["items"]): ItemState[] {
    return src.length
      ? src.map((i) => ({
          _key: nextKey(),
          medicationName: i.medicationName,
          units: i.units ?? "",
          activeIngredient: i.activeIngredient ?? "",
          posology: i.posology,
          indications: i.indications ?? "",
          warnings: i.warnings ?? "",
        }))
      : [emptyItem(nextKey())];
  }

  const [items, setItems] = useState<ItemState[]>(() => mapItems(record?.items ?? []));

  useEffect(() => {
    if (open) {
      setNotes(record?.notes ?? "");
      setItems(mapItems(record?.items ?? []));
    }
  }, [open, record]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateItem(key: number, field: keyof PrescriptionItemData, value: string) {
    setItems((prev) =>
      prev.map((it) => (it._key === key ? { ...it, [field]: value } : it))
    );
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem(nextKey())]);
  }

  function removeItem(key: number) {
    setItems((prev) => prev.filter((it) => it._key !== key));
  }

  const canSave = items.length > 0 && items.every((i) => i.medicationName.trim() && i.posology.trim());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;

    const data = {
      notes: notes.trim() || undefined,
      petId,
      veterinarianId: veterinarianId || undefined,
      appointmentId: appointmentId || undefined,
      items: items.map((i) => ({
        medicationName: i.medicationName.trim(),
        units: i.units?.trim() || undefined,
        activeIngredient: i.activeIngredient?.trim() || undefined,
        posology: i.posology.trim(),
        indications: i.indications?.trim() || undefined,
        warnings: i.warnings?.trim() || undefined,
      })),
    };

    startSave(async () => {
      const result = isEdit
        ? await updatePrescription(record.id, data)
        : await createPrescription(data);

      if ("error" in result) {
        toast.error(t("errorSave"));
        return;
      }
      toast.success(t("saved"));
      onSaved(result.prescription as PrescriptionFull);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("edit") : t("new")}
            <span className="text-muted-foreground font-normal text-sm ml-2">— {petName}</span>
          </DialogTitle>
        </DialogHeader>

        {appointmentTitle && (
          <p className="text-xs text-muted-foreground -mt-2">
            {t("linkedAppointment")}: <span className="font-medium">{appointmentTitle}</span>
          </p>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>

          {/* Medications */}
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div
                key={item._key}
                className={cn(
                  "border border-border rounded-lg p-3 space-y-3 bg-muted/20",
                )}
              >
                {/* Item header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pill className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t("medicationNumber")} {idx + 1}
                    </span>
                  </div>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:bg-destructive/10"
                      onClick={() => removeItem(item._key)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Medicamento */}
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Medicamento *</Label>
                    <Input
                      value={item.medicationName}
                      onChange={(e) => updateItem(item._key, "medicationName", e.target.value)}
                      placeholder="Amoxicilina 250mg..."
                      autoFocus={idx === 0}
                      required
                    />
                  </div>

                  {/* Principio activo */}
                  <div className="space-y-1">
                    <Label className="text-xs">Principio activo</Label>
                    <Input
                      value={item.activeIngredient ?? ""}
                      onChange={(e) => updateItem(item._key, "activeIngredient", e.target.value)}
                      placeholder="Amoxicilina..."
                    />
                  </div>

                  {/* Unidades */}
                  <div className="space-y-1">
                    <Label className="text-xs">Unidades</Label>
                    <Input
                      value={item.units ?? ""}
                      onChange={(e) => updateItem(item._key, "units", e.target.value)}
                      placeholder="10 comprimidos..."
                    />
                  </div>

                  {/* Posología */}
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Posología *</Label>
                    <Input
                      value={item.posology}
                      onChange={(e) => updateItem(item._key, "posology", e.target.value)}
                      placeholder="1 comprimido cada 12h durante 7 días..."
                      required
                    />
                  </div>

                  {/* Indicaciones */}
                  <div className="space-y-1">
                    <Label className="text-xs">Indicaciones</Label>
                    <Input
                      value={item.indications ?? ""}
                      onChange={(e) => updateItem(item._key, "indications", e.target.value)}
                      placeholder="Infección bacteriana..."
                    />
                  </div>

                  {/* Advertencias */}
                  <div className="space-y-1">
                    <Label className="text-xs">Advertencias</Label>
                    <Input
                      value={item.warnings ?? ""}
                      onChange={(e) => updateItem(item._key, "warnings", e.target.value)}
                      placeholder="No administrar en caso de..."
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={addItem}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t("addMedication")}
            </Button>
          </div>

          <Separator />

          {/* General notes */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              {t("notes")}
            </Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones generales de la receta..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary text-primary-foreground"
              disabled={isSaving || !canSave}
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {tc("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
