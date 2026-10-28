"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { bindField } from "@/lib/form-field";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { createVaccination, updateVaccination, deleteVaccination } from "@/lib/actions/vaccinations";
import { DeleteButton } from "@/components/common/DeleteButton";
import { useCan } from "@/components/layout/PermissionsProvider";
import type { VaccinationFull } from "@/lib/actions/vaccinations";
import { getVeterinarians } from "@/lib/actions/appointments";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { translateMessage } from "@/lib/i18n-messages";

const schema = z.object({
  petId: z.string().min(1),
  veterinarianId: z.string().min(1, "selectVet"),
  vaccineName: z.string().min(1, "required").max(100),
  dateAdministered: z.string().min(1, "required"),
  nextDueDate: z.string().optional().or(z.literal("")),
  batchNumber: z.string().max(50).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;
type Vet = { id: string; name: string; role: string };

interface VaccinationDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vaccination?: VaccinationFull;
  presetPetId: string;
  presetPetName: string;
  onSaved: (v: VaccinationFull) => void;
  onDeleted?: (id: string) => void;
}

export function VaccinationDialog({
  open,
  onOpenChange,
  vaccination,
  presetPetId,
  presetPetName,
  onSaved,
  onDeleted,
}: VaccinationDialogProps) {
  const isEdit = !!vaccination;
  const canDelete = useCan("medical.delete");
  const t = useTranslations("vaccinations");
  const tc = useTranslations("common");
  const tv = useTranslations("validation");
  const [isSaving, startSave] = useTransition();
  const [vets, setVets] = useState<Vet[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: vaccination
      ? {
          petId: vaccination.petId,
          veterinarianId: vaccination.veterinarianId,
          vaccineName: vaccination.vaccineName,
          dateAdministered: format(new Date(vaccination.dateAdministered), "yyyy-MM-dd"),
          nextDueDate: vaccination.nextDueDate
            ? format(new Date(vaccination.nextDueDate), "yyyy-MM-dd")
            : "",
          batchNumber: vaccination.batchNumber ?? "",
          notes: vaccination.notes ?? "",
        }
      : {
          petId: presetPetId,
          veterinarianId: "",
          vaccineName: "",
          dateAdministered: format(new Date(), "yyyy-MM-dd"),
          nextDueDate: "",
          batchNumber: "",
          notes: "",
        },
  });

  const watchVetId = form.watch("veterinarianId");

  useEffect(() => {
    getVeterinarians().then(setVets);
  }, []);

  useEffect(() => {
    if (vets.length && !form.getValues("veterinarianId")) {
      form.setValue("veterinarianId", vets[0].id);
    }
  }, [vets, form]);

  useEffect(() => {
    if (open && !isEdit) {
      form.reset({
        petId: presetPetId,
        veterinarianId: vets[0]?.id ?? "",
        vaccineName: "",
        dateAdministered: format(new Date(), "yyyy-MM-dd"),
        nextDueDate: "",
        batchNumber: "",
        notes: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(data: FormData) {
    startSave(async () => {
      if (isEdit) {
        const result = await updateVaccination(vaccination.id, data);
        if ("error" in result) { toast.error(t("errorUpdate")); return; }
        toast.success(t("updated"));
        onSaved(result.vaccination);
      } else {
        const result = await createVaccination(data);
        if ("error" in result) { toast.error(t("errorCreate")); return; }
        toast.success(t("created"));
        onSaved(result.vaccination);
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("edit") : t("new")}</DialogTitle>
        </DialogHeader>

        <form
          ref={formRef}
          className="space-y-4 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (formRef.current) {
              formRef.current
                .querySelectorAll<HTMLInputElement>("input[name], textarea[name]")
                .forEach((el) => {
                  if (el.value) {
                    form.setValue(el.name as keyof FormData, el.value, { shouldDirty: true });
                  }
                });
            }
            form.handleSubmit(handleSubmit)();
          }}
        >
          {/* Paciente (read-only) */}
          <div className="space-y-1.5">
            <Label>{t("patient")}</Label>
            <div className="px-3 py-2 rounded-lg bg-muted text-sm font-medium">{presetPetName}</div>
          </div>

          {/* Vacuna */}
          <div className="space-y-1.5">
            <Label htmlFor="vaccineName">{t("vaccineName")} *</Label>
            <Input id="vaccineName" placeholder={t("vaccineNamePlaceholder")} {...bindField(form, "vaccineName")} />
            {form.formState.errors.vaccineName && (
              <p className="text-xs text-destructive">{translateMessage(tv, form.formState.errors.vaccineName.message)}</p>
            )}
          </div>

          {/* Veterinario */}
          <div className="space-y-1.5">
            <Label>{t("veterinarian")} *</Label>
            <Select value={watchVetId} onValueChange={(v) => form.setValue("veterinarianId", v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder={tc("select")}>
                  {vets.find((v) => v.id === watchVetId)?.name ?? tc("select")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {vets.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.veterinarianId && (
              <p className="text-xs text-destructive">{translateMessage(tv, form.formState.errors.veterinarianId.message)}</p>
            )}
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dateAdministered">{t("dateAdministered")} *</Label>
              <Input id="dateAdministered" type="date" {...bindField(form, "dateAdministered")} />
              {form.formState.errors.dateAdministered && (
                <p className="text-xs text-destructive">{translateMessage(tv, form.formState.errors.dateAdministered.message)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nextDueDate">{t("nextDueDate")}</Label>
              <Input id="nextDueDate" type="date" {...bindField(form, "nextDueDate")} />
            </div>
          </div>

          {/* Lote */}
          <div className="space-y-1.5">
            <Label htmlFor="batchNumber">{t("batchNumber")}</Label>
            <Input id="batchNumber" placeholder={t("batchPlaceholder")} {...bindField(form, "batchNumber")} />
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">{t("notes")}</Label>
            <Textarea id="notes" rows={2} placeholder={tc("notesPlaceholder")} {...bindField(form, "notes")} />
          </div>

          <div className="flex gap-2 pt-1">
            {isEdit && onDeleted && canDelete && (
              <DeleteButton
                confirmText={t("deleteConfirm")}
                onDelete={async () => {
                  await deleteVaccination(vaccination.id, vaccination.petId);
                  toast.success(t("deleted"));
                  onDeleted(vaccination.id);
                  onOpenChange(false);
                }}
              />
            )}
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" className="flex-1 bg-primary text-primary-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? tc("saveChanges") : t("register")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
