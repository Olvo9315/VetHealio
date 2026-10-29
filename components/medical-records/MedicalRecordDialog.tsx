"use client";

import { useTranslations } from "next-intl";
import { translateMessage } from "@/lib/i18n-messages";
import { useState, useTransition, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { bindField } from "@/lib/form-field";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import {
  createMedicalRecord,
  updateMedicalRecord,
  deleteMedicalRecord,
  getMedicalRecordForAppointment,
  getExamTemplate,
} from "@/lib/actions/medicalRecords";
import { ExamChecklist } from "./ExamChecklist";
import { DEFAULT_EXAM_KEYS, examRows, type ExamRow } from "@/lib/exam";
import type { MedicalRecordDraft } from "@/lib/actions/medicalRecords";
import { RecordPrescriptions } from "./RecordPrescriptions";
import { formatAppointmentId } from "@/lib/utils";
import { DeleteButton } from "@/components/common/DeleteButton";
import { useCan } from "@/components/layout/PermissionsProvider";
import type { MedicalRecordFull, MedicalRecordFormData } from "@/lib/actions/medicalRecords";
import { searchPetsForAppointment } from "@/lib/actions/appointments";
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
import { Separator } from "@/components/ui/separator";
import { Search, PawPrint, Plus, Trash2, Loader2, Pill, CalendarCheck, Home, Wand2, AlertTriangle } from "lucide-react";

// ---- Schema ----
const prescriptionSchema = z.object({
  medicationName: z.string().min(1, "required"),
  dosage: z.string().optional().or(z.literal("")),
  frequency: z.string().optional().or(z.literal("")),
  duration: z.string().optional().or(z.literal("")),
  notes: z.string().max(200).optional().or(z.literal("")),
});

const schema = z.object({
  petId: z.string().min(1, "selectPatient"),
  veterinarianId: z.string().min(1, "selectVet"),
  date: z.string().min(1, "required"),
  chiefComplaint: z.string().min(1, "required").max(500),
  diagnosis: z.string().max(500).optional().or(z.literal("")),
  treatment: z.string().max(500).optional().or(z.literal("")),
  weight: z.coerce.number().positive().optional().or(z.literal("")),
  temperature: z.coerce.number().positive().optional().or(z.literal("")),
  heartRate: z.coerce.number().int().positive().optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  clinicalSigns: z.string().max(2000).optional().or(z.literal("")),
  presumptiveDiagnosis: z.string().max(500).optional().or(z.literal("")),
  homeCare: z.string().max(4000).optional().or(z.literal("")),
  exam: z.array(z.object({ key: z.string(), status: z.enum(["normal", "abnormal"]).nullable(), note: z.string() })).optional(),
  prescriptions: z.array(prescriptionSchema).optional(),
  appointmentId: z.string().optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;
type PetResult = { id: string; name: string; species: string; owner: { firstName: string; lastName: string; phone: string } };
type Vet = { id: string; name: string; role: string };

interface MedicalRecordDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  record?: MedicalRecordFull;
  presetPetId?: string;
  presetPetName?: string;
  onSaved: (record: MedicalRecordFull) => void;
  onDeleted?: (id: string) => void;
  // New record of a visit, filled in from it
  draft?: MedicalRecordDraft;
  // The patient's visits, to fill a new record from one of them
  appointments?: VisitOption[];
}

type VisitOption = { id: string; number: number; title: string; startTime: Date };

// Medications typed inside the record; prescriptions written with the prescription form are shown apart
function inlineMedications(record: MedicalRecordFull) {
  return record.prescriptions
    .filter((p) => !p.items?.length && p.medicationName)
    .map((p) => ({
      medicationName: p.medicationName,
      dosage: p.dosage ?? "",
      frequency: p.frequency ?? "",
      duration: p.duration ?? "",
      notes: p.notes ?? "",
    }));
}

function valuesFromRecord(record: MedicalRecordFull, template: string[]): FormData {
  return {
    petId: record.petId,
    veterinarianId: record.veterinarianId,
    date: format(new Date(record.date), "yyyy-MM-dd'T'HH:mm"),
    chiefComplaint: record.chiefComplaint,
    diagnosis: record.diagnosis ?? "",
    treatment: record.treatment ?? "",
    weight: record.weight ?? "",
    temperature: record.temperature ?? "",
    heartRate: record.heartRate ?? "",
    notes: record.notes ?? "",
    clinicalSigns: record.clinicalSigns ?? "",
    presumptiveDiagnosis: record.presumptiveDiagnosis ?? "",
    homeCare: record.homeCare ?? "",
    exam: examRows(record.exam, template),
    prescriptions: inlineMedications(record),
    appointmentId: record.appointmentId ?? "",
  };
}

function valuesFromDraft(d: MedicalRecordDraft, template: string[]): FormData {
  return {
    petId: d.petId,
    veterinarianId: d.veterinarianId,
    date: format(new Date(d.date), "yyyy-MM-dd'T'HH:mm"),
    chiefComplaint: d.chiefComplaint,
    diagnosis: "",
    treatment: d.treatment,
    weight: d.weight ?? "",
    temperature: "",
    heartRate: "",
    notes: d.notes,
    clinicalSigns: "",
    presumptiveDiagnosis: "",
    homeCare: "",
    exam: examRows(null, template),
    prescriptions: [],
    appointmentId: d.appointmentId,
  };
}

function emptyValues(petId: string, vetId: string, template: string[]): FormData {
  return {
    petId,
    veterinarianId: vetId,
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    chiefComplaint: "",
    diagnosis: "",
    treatment: "",
    weight: "",
    temperature: "",
    heartRate: "",
    notes: "",
    clinicalSigns: "",
    presumptiveDiagnosis: "",
    homeCare: "",
    exam: examRows(null, template),
    prescriptions: [],
    appointmentId: "",
  };
}

// Instructions for the owner, gathered from the treatment and the medications of the record
function suggestHomeCare(values: FormData, record?: MedicalRecordFull) {
  const lines: string[] = [];
  if (values.treatment?.trim()) lines.push(values.treatment.trim());
  for (const m of values.prescriptions ?? []) {
    if (!m.medicationName.trim()) continue;
    const parts = [m.dosage, m.frequency, m.duration].map((x) => x?.trim()).filter(Boolean);
    lines.push(`• ${m.medicationName.trim()}${parts.length ? `: ${parts.join(", ")}` : ""}`);
  }
  for (const p of record?.prescriptions ?? []) {
    for (const i of p.items ?? []) lines.push(`• ${i.medicationName}${i.units ? ` ${i.units}` : ""}: ${i.posology}`);
  }
  return Array.from(new Set(lines)).join("\n");
}

export function MedicalRecordDialog({
  open,
  onOpenChange,
  record,
  presetPetId,
  presetPetName,
  onSaved,
  onDeleted,
  draft,
  appointments,
}: MedicalRecordDialogProps) {
  const isEdit = !!record;
  const canDelete = useCan("medical.delete");
  const t = useTranslations("medicalRecords");
  const tc = useTranslations("common");
  const tv = useTranslations("validation");
  const [isSaving, startSave] = useTransition();
  const [vets, setVets] = useState<Vet[]>([]);
  const [template, setTemplate] = useState<string[]>([...DEFAULT_EXAM_KEYS]);
  const formRef = useRef<HTMLFormElement>(null);

  // Pet search
  const [petQuery, setPetQuery] = useState("");
  const [petResults, setPetResults] = useState<PetResult[]>([]);
  const [selectedPet, setSelectedPet] = useState<PetResult | null>(null);
  const [isSearching, startSearch] = useTransition();

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: record
      ? valuesFromRecord(record, template)
      : draft
      ? valuesFromDraft(draft, template)
      : emptyValues(presetPetId ?? "", "", template),
  });
  const exam = (form.watch("exam") ?? []) as ExamRow[];

  // Medications typed in the record. Not a useFieldArray: with controlled inputs its rows were
  // re-created on every keystroke and the field lost focus after each character.
  const medications = form.watch("prescriptions") ?? [];
  const setMedications = (list: NonNullable<FormData["prescriptions"]>) =>
    form.setValue("prescriptions", list, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });

  // Load vets
  useEffect(() => {
    getVeterinarians().then(setVets);
    getExamTemplate().then((keys) => {
      setTemplate(keys);
      // Rows of the clinic's own list, keeping anything already marked
      form.setValue("exam", examRows(form.getValues("exam")?.filter((r) => r.status || r.note), keys));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const watchVetId = form.watch("veterinarianId");
  const watchVisitId = form.watch("appointmentId");
  const [isFilling, startFill] = useTransition();
  const visit: VisitOption | undefined =
    (record?.appointment && record.appointment.id === watchVisitId ? record.appointment : undefined) ??
    (draft && draft.appointmentId === watchVisitId
      ? { id: draft.appointmentId, number: draft.appointmentNumber, title: draft.chiefComplaint, startTime: draft.date }
      : undefined) ??
    appointments?.find((a) => a.id === watchVisitId);

  function fillFromVisit(appointmentId: string) {
    startFill(async () => {
      const res = await getMedicalRecordForAppointment(appointmentId);
      if (!res) return;
      if ("record" in res) {
        toast.info(t("visitHasRecord"));
        return;
      }
      const values = valuesFromDraft(res.draft, template);
      // Keep what was already typed; fill in the rest from the visit
      const current = form.getValues();
      (Object.keys(values) as (keyof FormData)[]).forEach((k) => {
        const cur = current[k];
        if (k === "exam") return;
        if (k === "appointmentId" || cur === "" || cur === undefined || (Array.isArray(cur) && cur.length === 0)) {
          form.setValue(k, values[k] as never, { shouldDirty: true });
        }
      });
    });
  }
  const watchDate = form.watch("date");

  // Re-initialize on open
  useEffect(() => {
    if (!open) return;
    if (isEdit && record) {
      form.reset(valuesFromRecord(record, template));
    } else if (draft) {
      form.reset(valuesFromDraft(draft, template));
    } else {
      form.reset(emptyValues(presetPetId ?? "", vets[0]?.id ?? "", template));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Set default vet when vets load
  useEffect(() => {
    if (vets.length && !form.getValues("veterinarianId")) {
      form.setValue("veterinarianId", vets[0].id);
    }
  }, [vets, form]);

  // Populate pet on edit
  useEffect(() => {
    if (record) {
      setSelectedPet({
        id: record.petId,
        name: record.pet?.name ?? presetPetName ?? "",
        species: record.pet?.species ?? "",
        owner: record.pet?.owner ?? { firstName: "", lastName: "", phone: "" },
      });
    } else if (draft) {
      setSelectedPet({ id: draft.petId, name: draft.petName, species: "", owner: { firstName: "", lastName: "", phone: "" } });
    } else if (presetPetId && presetPetName) {
      setSelectedPet({ id: presetPetId, name: presetPetName, species: "", owner: { firstName: "", lastName: "", phone: "" } });
    }
  }, [record, draft, presetPetId, presetPetName]);

  // Reset on close
  useEffect(() => {
    if (!open && !isEdit) {
      setTimeout(() => {
        form.reset();
        setSelectedPet(presetPetId ? { id: presetPetId, name: presetPetName ?? "", species: "", owner: { firstName: "", lastName: "", phone: "" } } : null);
        setPetQuery("");
        setPetResults([]);
      }, 150);
    }
  }, [open, isEdit, form, presetPetId, presetPetName]);

  // Pet search
  useEffect(() => {
    if (petQuery.length < 2) { setPetResults([]); return; }
    startSearch(async () => {
      const results = await searchPetsForAppointment(petQuery);
      setPetResults(results as PetResult[]);
    });
  }, [petQuery]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleSubmit(data: any) {
    startSave(async () => {
      if (isEdit) {
        const result = await updateMedicalRecord(record.id, data as MedicalRecordFormData);
        if ("error" in result) { toast.error(t("errorUpdate")); return; }
        toast.success(t("updated"));
        onSaved(result.record);
      } else {
        const result = await createMedicalRecord(data as MedicalRecordFormData);
        if ("error" in result) { toast.error(t("errorCreate")); return; }
        toast.success(t("created"));
        onSaved(result.record);
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editRecord") : t("newRecord")}</DialogTitle>
        </DialogHeader>

        <form
          ref={formRef}
          className="space-y-5 mt-2"
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
            form.handleSubmit(handleSubmit, () => toast.error(t("checkFields")))();
          }}
        >
          {/* Row: Patient + Vet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Patient search */}
            <div className="space-y-1.5">
              <Label>{t("patient")} *</Label>
              {selectedPet ? (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <PawPrint className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{selectedPet.name}</p>
                      {selectedPet.owner.firstName && (
                        <p className="text-xs text-muted-foreground">
                          {selectedPet.owner.firstName} {selectedPet.owner.lastName}
                        </p>
                      )}
                    </div>
                  </div>
                  {!presetPetId && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => { setSelectedPet(null); form.setValue("petId", ""); }}
                    >
                      {tc("change")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder={t("petSearch")}
                      className="pl-9"
                      value={petQuery}
                      onChange={(e) => setPetQuery(e.target.value)}
                    />
                    {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                  </div>
                  {petResults.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden divide-y divide-border max-h-36 overflow-y-auto">
                      {petResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                          onClick={() => {
                            setSelectedPet(p);
                            form.setValue("petId", p.id);
                            setPetQuery("");
                            setPetResults([]);
                          }}
                        >
                          <PawPrint className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.owner.firstName} {p.owner.lastName}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.formState.errors.petId && (
                    <p className="text-xs text-destructive">{translateMessage(tv, form.formState.errors.petId.message)}</p>
                  )}
                </div>
              )}
            </div>

            {/* Date + Vet stacked */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="date">{t("date")} *</Label>
                <Input
                  id="date"
                  type="datetime-local"
                  value={watchDate ?? ""}
                  onChange={(e) => form.setValue("date", e.target.value, { shouldValidate: true })}
                />
                {form.formState.errors.date && (
                  <p className="text-xs text-destructive">{translateMessage(tv, form.formState.errors.date.message)}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{t("veterinarian")} *</Label>
                <Select
                  value={watchVetId}
                  onValueChange={(v) => form.setValue("veterinarianId", v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tc("select")}>
                      {vets.find((v) => v.id === watchVetId)?.name ?? tc("select")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {vets.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name ?? v.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Visit this record documents */}
          {watchVisitId ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <CalendarCheck className="w-4 h-4 text-primary shrink-0" />
              <span className="text-muted-foreground">{t("fromVisit")}</span>
              {visit && (
                <span className="font-medium truncate">
                  {formatAppointmentId(visit.number)} · {format(new Date(visit.startTime), "dd/MM/yyyy HH:mm")}
                </span>
              )}
              {!isEdit && !draft && (
                <button
                  type="button"
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => form.setValue("appointmentId", "")}
                >
                  {tc("change")}
                </button>
              )}
            </div>
          ) : (
            !isEdit && !!appointments?.length && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  {t("fillFromVisit")}
                  {isFilling && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                </Label>
                <Select value="" onValueChange={(v) => v && fillFromVisit(v as string)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("chooseVisit")}>{t("chooseVisit")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {appointments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {format(new Date(a.startTime), "dd/MM/yyyy")} · {a.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          )}

          {record?.pet?.alerts && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="whitespace-pre-line">{record.pet.alerts}</span>
            </div>
          )}

          <Separator />

          {/* Chief complaint */}
          <div className="space-y-1.5">
            <Label htmlFor="chiefComplaint">{t("chiefComplaint")} *</Label>
            <Textarea id="chiefComplaint" rows={2} placeholder={t("chiefComplaintPlaceholder")} {...bindField(form, "chiefComplaint")} />
            {form.formState.errors.chiefComplaint && (
              <p className="text-xs text-destructive">{translateMessage(tv, form.formState.errors.chiefComplaint.message)}</p>
            )}
          </div>

          {/* Symptoms */}
          <div className="space-y-1.5">
            <Label htmlFor="clinicalSigns">{t("clinicalSigns")}</Label>
            <Textarea id="clinicalSigns" rows={2} placeholder={t("clinicalSignsPlaceholder")} {...bindField(form, "clinicalSigns")} />
          </div>

          {/* Vitals */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("vitals")}</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="weight">{t("weight")}</Label>
                <Input id="weight" type="number" step="0.1" placeholder="0.0" {...bindField(form, "weight")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="temperature">{t("temperatureShort")}</Label>
                <Input id="temperature" type="number" step="0.1" placeholder="38.5" {...bindField(form, "temperature")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="heartRate">{t("heartRate")}</Label>
                <Input id="heartRate" type="number" placeholder="80" {...bindField(form, "heartRate")} />
              </div>
            </div>
          </div>

          {/* Physical exam */}
          <ExamChecklist rows={exam} onChange={(rows) => form.setValue("exam", rows, { shouldDirty: true })} />

          {/* Diagnosis: working, then definitive */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="presumptiveDiagnosis">{t("presumptiveDiagnosis")}</Label>
              <Textarea id="presumptiveDiagnosis" rows={2} placeholder={t("presumptiveDiagnosisPlaceholder")} {...bindField(form, "presumptiveDiagnosis")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="diagnosis">{t("diagnosis")}</Label>
              <Textarea id="diagnosis" rows={2} placeholder={t("diagnosisPlaceholder")} {...bindField(form, "diagnosis")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="treatment">{t("treatment")}</Label>
            <Textarea id="treatment" rows={2} placeholder={t("treatmentPlaceholder")} {...bindField(form, "treatment")} />
          </div>

          {/* Instructions for the owner at home */}
          <div className="space-y-1.5 rounded-lg border border-primary/25 bg-primary/5 p-3">
            <div className="flex items-center gap-2">
              <Home className="w-4 h-4 text-primary" />
              <Label htmlFor="homeCare" className="flex-1">{t("homeCare")}</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline flex items-center gap-1"
                onClick={() => {
                  const text = suggestHomeCare(form.getValues(), record);
                  if (!text) { toast.info(t("homeCareNothing")); return; }
                  const cur = form.getValues("homeCare")?.trim();
                  form.setValue("homeCare", cur ? `${cur}\n${text}` : text, { shouldDirty: true });
                }}
              >
                <Wand2 className="w-3.5 h-3.5" />
                {t("homeCareFill")}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t("homeCareHint")}</p>
            <Textarea id="homeCare" rows={4} className="bg-background" placeholder={t("homeCarePlaceholder")} {...bindField(form, "homeCare")} />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">{t("additionalNotes")}</Label>
            <Textarea id="notes" rows={2} placeholder={tc("notesPlaceholder")} {...bindField(form, "notes")} />
          </div>

          <Separator />

          {/* Prescriptions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("prescriptions")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setMedications([...medications, { medicationName: "", dosage: "", frequency: "", duration: "", notes: "" }])}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {t("addMedication")}
              </Button>
            </div>

            {/* Prescriptions written in the visit (edited in Prescriptions) */}
            {record && record.prescriptions.some((p) => p.items?.length) && (
              <RecordPrescriptions prescriptions={record.prescriptions.filter((p) => p.items?.length)} />
            )}

            {medications.length === 0 && !record?.prescriptions.some((p) => p.items?.length) && (
              <p className="text-sm text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
                {t("noPrescriptions")}
              </p>
            )}

            {medications.map((_, idx) => (
              <div key={idx} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Pill className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">{t("medicationN", { n: idx + 1 })}</span>
                  </div>
                  <button type="button" onClick={() => setMedications(medications.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <Input placeholder={t("medicationNamePlaceholder")} {...bindField(form, `prescriptions.${idx}.medicationName`)} />
                    {form.formState.errors.prescriptions?.[idx]?.medicationName && (
                      <p className="text-xs text-destructive mt-0.5">{translateMessage(tv, form.formState.errors.prescriptions[idx]?.medicationName?.message)}</p>
                    )}
                  </div>
                  <Input placeholder={t("dosagePlaceholder")} {...bindField(form, `prescriptions.${idx}.dosage`)} />
                  <Input placeholder={t("frequencyPlaceholder")} {...bindField(form, `prescriptions.${idx}.frequency`)} />
                  <Input placeholder={t("durationPlaceholder")} {...bindField(form, `prescriptions.${idx}.duration`)} />
                  <Input placeholder={t("optionalNotes")} {...bindField(form, `prescriptions.${idx}.notes`)} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            {isEdit && onDeleted && canDelete && (
              <DeleteButton
                confirmText={t("deleteConfirm")}
                onDelete={async () => {
                  await deleteMedicalRecord(record.id);
                  toast.success(t("deleted"));
                  onDeleted(record.id);
                  onOpenChange(false);
                }}
              />
            )}
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" className="flex-1 bg-primary text-primary-foreground" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? tc("saveChanges") : t("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
