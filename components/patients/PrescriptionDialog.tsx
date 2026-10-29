"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { createPrescription, updatePrescription, deletePrescription } from "@/lib/actions/prescriptions";
import { getVeterinarians } from "@/lib/actions/appointments";
import { DeleteButton } from "@/components/common/DeleteButton";
import { useCan } from "@/components/layout/PermissionsProvider";
import type { PrescriptionFull, PrescriptionItemData } from "@/lib/actions/prescriptions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, Trash2, Pill } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PresvetFields } from "./PresvetFields";
import { MedicationInput } from "./MedicationInput";
import { isAntibioticIngredient } from "@/lib/presvet";

interface PrescriptionDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  petId: string;
  petName: string;
  veterinarianId?: string;
  appointmentId?: string;
  appointmentTitle?: string;
  // Written from a medical record: belongs to it
  medicalRecordId?: string;
  record?: PrescriptionFull;
  onSaved: (p: PrescriptionFull) => void;
  onDeleted?: (id: string) => void;
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
  medicalRecordId,
  record,
  onSaved,
  onDeleted,
}: PrescriptionDialogProps) {
  const canDelete = useCan("medical.delete");
  const t = useTranslations("prescriptions");
  const tc = useTranslations("common");
  const [isSaving, startSave] = useTransition();

  const isEdit = !!record;

  const [notes, setNotes] = useState(record?.notes ?? "");
  // Prescribing vet (required on the prescription and for PRESVET)
  const [vetId, setVetId] = useState(record?.veterinarianId ?? veterinarianId ?? "");
  const [vets, setVets] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { getVeterinarians().then(setVets); }, []);
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
          antibiotic: i.antibiotic,
          nationalCode: i.nationalCode ?? "",
          route: i.route ?? "",
          treatmentDays: i.treatmentDays ?? "",
          packages: i.packages ?? "",
          purpose: (i.purpose ?? "") as PrescriptionItemData["purpose"],
          exceptional: i.exceptional,
        }))
      : [emptyItem(nextKey())];
  }

  const [items, setItems] = useState<ItemState[]>(() => mapItems(record?.items ?? []));

  useEffect(() => {
    if (open) {
      setNotes(record?.notes ?? "");
      setVetId(record?.veterinarianId ?? veterinarianId ?? "");
      setItems(mapItems(record?.items ?? []));
    }
  }, [open, record]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateItem(key: number, field: keyof PrescriptionItemData, value: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it._key !== key) return it;
        const next = { ...it, [field]: value };
        // An antimicrobial active ingredient switches the PRESVET data on (the vet can switch it off)
        if (field === "activeIngredient" && !it.antibiotic && isAntibioticIngredient(value) && !isAntibioticIngredient(it.activeIngredient)) {
          next.antibiotic = true;
        }
        return next;
      })
    );
  }

  function patchItem(key: number, patch: Partial<ItemState>) {
    setItems((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem(nextKey())]);
  }

  function removeItem(key: number) {
    setItems((prev) => prev.filter((it) => it._key !== key));
  }

  const canSave = !!vetId && items.length > 0 && items.every((i) => i.medicationName.trim() && i.posology.trim());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;

    const data = {
      notes: notes.trim() || undefined,
      petId,
      veterinarianId: vetId || undefined,
      appointmentId: appointmentId || undefined,
      medicalRecordId: medicalRecordId || undefined,
      items: items.map((i) => ({
        medicationName: i.medicationName.trim(),
        units: i.units?.trim() || undefined,
        activeIngredient: i.activeIngredient?.trim() || undefined,
        posology: i.posology.trim(),
        indications: i.indications?.trim() || undefined,
        warnings: i.warnings?.trim() || undefined,
        antibiotic: !!i.antibiotic,
        nationalCode: i.nationalCode || undefined,
        route: i.route || undefined,
        treatmentDays: i.treatmentDays || undefined,
        packages: i.packages || undefined,
        purpose: i.purpose || undefined,
        exceptional: !!i.exceptional,
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
          <div className="space-y-1">
            <Label className="text-xs">{t("prescribingVet")} *</Label>
            <select
              className={cn("h-9 w-full rounded-md border bg-background px-2 text-sm", !vetId && "border-amber-400")}
              value={vetId}
              onChange={(e) => setVetId(e.target.value)}
            >
              <option value="">{t("chooseVet")}</option>
              {vets.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

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
                    <Label className="text-xs">{t("medicationName")} *</Label>
                    <MedicationInput
                      value={item.medicationName}
                      onChange={(v) => updateItem(item._key, "medicationName", v)}
                      onPick={(m) => patchItem(item._key, {
                        medicationName: m.name,
                        activeIngredient: m.activeIngredient ?? item.activeIngredient,
                        units: m.units ?? item.units,
                        posology: item.posology || m.posology || "",
                        nationalCode: m.nationalCode ?? item.nationalCode,
                        ...(m.route ? { route: m.route as ItemState["route"] } : {}),
                        antibiotic: item.antibiotic || m.antibiotic || isAntibioticIngredient(m.activeIngredient),
                      })}
                      placeholder={t("medicationPlaceholder")}
                      autoFocus={idx === 0}
                    />
                  </div>

                  {/* Principio activo */}
                  <div className="space-y-1">
                    <Label className="text-xs">{t("activeIngredient")}</Label>
                    <Input
                      value={item.activeIngredient ?? ""}
                      onChange={(e) => updateItem(item._key, "activeIngredient", e.target.value)}
                      placeholder={t("activeIngredientPlaceholder")}
                    />
                  </div>

                  {/* Unidades */}
                  <div className="space-y-1">
                    <Label className="text-xs">{t("units")}</Label>
                    <Input
                      value={item.units ?? ""}
                      onChange={(e) => updateItem(item._key, "units", e.target.value)}
                      placeholder={t("unitsPlaceholder")}
                    />
                  </div>

                  {/* Posología */}
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">{t("posology")} *</Label>
                    <Input
                      value={item.posology}
                      onChange={(e) => updateItem(item._key, "posology", e.target.value)}
                      placeholder={t("posologyPlaceholder")}
                      required
                    />
                  </div>

                  {/* Indicaciones */}
                  <div className="space-y-1">
                    <Label className="text-xs">{t("indications")}</Label>
                    <Input
                      value={item.indications ?? ""}
                      onChange={(e) => updateItem(item._key, "indications", e.target.value)}
                      placeholder={t("indicationsPlaceholder")}
                    />
                  </div>

                  {/* Advertencias */}
                  <div className="space-y-1">
                    <Label className="text-xs">{t("warnings")}</Label>
                    <Input
                      value={item.warnings ?? ""}
                      onChange={(e) => updateItem(item._key, "warnings", e.target.value)}
                      placeholder={t("warningsPlaceholder")}
                    />
                  </div>

                  <PresvetFields
                    value={{
                      antibiotic: item.antibiotic,
                      nationalCode: item.nationalCode ?? "",
                      route: item.route ?? "",
                      treatmentDays: item.treatmentDays ?? "",
                      packages: item.packages ?? "",
                      purpose: item.purpose ?? "",
                      exceptional: item.exceptional,
                    }}
                    suggested={isAntibioticIngredient(item.activeIngredient) || isAntibioticIngredient(item.medicationName)}
                    onChange={(v) => patchItem(item._key, v as Partial<ItemState>)}
                  />
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
              placeholder={t("notesPlaceholder")}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {record && onDeleted && canDelete && (
              <DeleteButton
                confirmText={t("deleteConfirm")}
                onDelete={async () => {
                  await deletePrescription(record.id);
                  toast.success(t("deleted"));
                  onDeleted(record.id);
                  onOpenChange(false);
                }}
              />
            )}
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
