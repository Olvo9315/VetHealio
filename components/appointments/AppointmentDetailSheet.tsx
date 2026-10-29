"use client";

import { useEffect, useState, useTransition } from "react";
import { format, differenceInMinutes } from "date-fns";
import { useDateLocale } from "@/lib/date-locale";
import type { AppointmentFull } from "@/lib/actions/appointments";
import {
  updateAppointmentStatus,
  deleteAppointment,
  getVisitDocuments,
  type VisitDocuments,
} from "@/lib/actions/appointments";
import { statusConfig, getTypeCfgForAppointment, cfgLabel } from "./AppointmentConfig";
import { useTranslations } from "next-intl";
import { AppointmentStatus } from "@prisma/client";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pencil,
  Trash2,
  Clock,
  User,
  PawPrint,
  Phone,
  FileText,
  Loader2,
  Receipt,
  Pill,
  Stethoscope,
  Printer,
  ChevronRight,
} from "lucide-react";
import { cn, formatAppointmentId, formatEstimateId, formatInvoiceId, formatPrescriptionId } from "@/lib/utils";
import { useCan } from "@/components/layout/PermissionsProvider";
import type { ServiceFlat } from "@/lib/actions/services";
import { servicePath } from "@/lib/service-path";
import { EstimateDialog } from "@/components/estimates/EstimateDialog";
import { getAppointmentEstimates, type EstimateFull } from "@/lib/actions/estimates";
import { estimateState, ESTIMATE_STATE_STYLE } from "@/lib/estimates";
import { formatEur } from "@/lib/format";
import { InvoiceSheetHost } from "@/components/finances/InvoiceSheetHost";
import { InvoiceDialog } from "@/components/finances/InvoiceDialog";
import { PrescriptionDialog } from "@/components/patients/PrescriptionDialog";
import { VisitMedicalRecordDialog } from "@/components/medical-records/VisitMedicalRecordDialog";
import { getPrescriptionForEdit, type PrescriptionFull } from "@/lib/actions/prescriptions";
import type { AppointmentOption } from "@/lib/actions/invoices";

interface AppointmentDetailSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  appointment: AppointmentFull;
  onUpdated: (apt: AppointmentFull) => void;
  onDeleted: (id: string) => void;
  onEdit: () => void;
  onCreateInvoice?: () => void;
  onCreatePrescription?: () => void;
  onCreateMedicalRecord?: () => void;
  // Catalog, to show "Category › Sub-service" instead of a bare sub-service name
  services?: ServiceFlat[];
}

export function AppointmentDetailSheet({
  open,
  onOpenChange,
  appointment,
  onUpdated,
  onDeleted,
  onEdit,
  onCreateInvoice,
  onCreatePrescription,
  onCreateMedicalRecord,
  services = [],
}: AppointmentDetailSheetProps) {
  const dateLocale = useDateLocale();
  const canInvoice = useCan("invoice.write");
  const canPrescribe = useCan("prescription.write");
  const canMedical = useCan("medical.write");
  const t = useTranslations("appointments");
  const tr = useTranslations("rooms");
  const tc = useTranslations("common");
  const [isUpdating, startUpdate] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  // Presupuesto for this visit (e.g. a surgery to plan): written right here
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [estimates, setEstimates] = useState<EstimateFull[]>([]);
  const [editingEstimate, setEditingEstimate] = useState<EstimateFull | null>(null);
  const te = useTranslations("estimates");

  // What was already written for this visit, listed above the buttons
  const [docs, setDocs] = useState<VisitDocuments | null>(null);
  // Opened from here when the screen that shows this menu doesn't open them itself (e.g. the phone list)
  const [billId, setBillId] = useState<string | null>(null);
  const [newBill, setNewBill] = useState<AppointmentOption | undefined>();
  const [rx, setRx] = useState<{ open: boolean; record?: PrescriptionFull }>({ open: false });
  const [recordVisit, setRecordVisit] = useState<string | null>(null);

  function loadDocs() {
    getVisitDocuments(appointment.id).then(setDocs);
    if (canInvoice) getAppointmentEstimates(appointment.id).then(setEstimates);
  }

  useEffect(() => {
    if (open) loadDocs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointment.id, canInvoice]);

  function createInvoice() {
    if (onCreateInvoice) return onCreateInvoice();
    const withPrice = (sv: { id: string; name: string; officialName?: string }) => ({ ...sv, price: services.find((x) => x.id === sv.id)?.price ?? null });
    onOpenChange(false);
    setNewBill({
      id: appointment.id,
      title: appointment.title,
      startTime: appointment.startTime,
      type: appointment.type,
      service: appointment.service ? withPrice(appointment.service) : null,
      extraServices: (appointment.extraServices ?? []).map(withPrice),
      pet: appointment.pet,
    } as AppointmentOption);
  }

  function createPrescription() {
    if (onCreatePrescription) return onCreatePrescription();
    onOpenChange(false);
    setRx({ open: true });
  }

  function openRecord() {
    if (onCreateMedicalRecord) return onCreateMedicalRecord();
    onOpenChange(false);
    setRecordVisit(appointment.id);
  }

  async function openPrescription(id: string) {
    const found = await getPrescriptionForEdit(id);
    if (!found) return;
    onOpenChange(false);
    setRx({ open: true, record: found.prescription });
  }

  function estimateSaved(e: EstimateFull) {
    setEstimates((prev) => (prev.some((x) => x.id === e.id) ? prev.map((x) => (x.id === e.id ? e : x)) : [e, ...prev]));
  }

  const typeCfg = getTypeCfgForAppointment(appointment);
  const stCfg = statusConfig[appointment.status];
  const duration = differenceInMinutes(
    new Date(appointment.endTime),
    new Date(appointment.startTime)
  );

  function handleStatusChange(status: string) {
    if (!status) return;
    startUpdate(async () => {
      await updateAppointmentStatus(appointment.id, status as AppointmentStatus);
      toast.success(t("statusUpdated"));
      onUpdated({ ...appointment, status: status as AppointmentStatus });
    });
  }

  function handleDelete() {
    if (!confirm(t("deleteNamedConfirm", { title: appointment.title }))) return;
    startDelete(async () => {
      await deleteAppointment(appointment.id);
      toast.success(t("deleted"));
      onDeleted(appointment.id);
    });
  }

  // Documents already written for the visit and the buttons to write new ones
  const visitActions = (
    <>
          {docs && (docs.invoice || docs.prescriptions.length > 0 || docs.record) && (
            <div className="space-y-1.5 pb-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("visitDocuments")}</p>
              {docs.invoice && (
                <DocRow
                  icon={Receipt}
                  onClick={() => { onOpenChange(false); setBillId(docs.invoice!.id); }}
                  label={<><span className="font-mono text-xs">{formatInvoiceId(docs.invoice.number, docs.invoice.createdAt)}</span> · {formatEur(docs.invoice.totalAmount)}</>}
                  badge={docs.invoice.status === "PAID" ? t("docPaid") : docs.invoice.status === "CANCELLED" ? t("docCancelled") : docs.invoice.totalAmount - docs.invoice.paidAmount > 0.005 ? t("docDue", { amount: formatEur(docs.invoice.totalAmount - docs.invoice.paidAmount) }) : undefined}
                  badgeTone={docs.invoice.status === "PAID" ? "ok" : docs.invoice.status === "CANCELLED" ? "muted" : "warn"}
                />
              )}
              {docs.prescriptions.map((p) => (
                <DocRow
                  key={p.id}
                  icon={Pill}
                  onClick={() => openPrescription(p.id)}
                  label={<><span className="font-mono text-xs">{formatPrescriptionId(p.number)}</span> · {p.items.join(", ")}</>}
                  extra={
                    <button type="button" title={t("printPrescription")} onClick={(e) => { e.stopPropagation(); window.open(`/print/prescription/${p.id}`, "_blank"); }} className="p-1 text-muted-foreground hover:text-foreground">
                      <Printer className="w-4 h-4" />
                    </button>
                  }
                />
              ))}
              {docs.record && (
                <DocRow icon={Stethoscope} onClick={openRecord} label={docs.record.diagnosis ? `${t("docRecord")} · ${docs.record.diagnosis}` : t("docRecord")} />
              )}
            </div>
          )}
          {canInvoice && !docs?.invoice && (
            <Button className="w-full" variant="outline" onClick={createInvoice}>
              <Receipt className="w-4 h-4 mr-2" />
              {t("createInvoice")}
            </Button>
          )}
          {/* This visit's presupuestos: opened again from here */}
          {canInvoice && estimates.map((e) => {
            const state = estimateState(e);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => { onOpenChange(false); setEditingEstimate(e); }}
                className="w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/40"
              >
                <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                <span className="flex-1 min-w-0 truncate" title={te("estimate")}><span className="font-mono text-xs">{formatEstimateId(e.number)}</span> · {e.title}</span>
                <span className="font-medium shrink-0">{formatEur(e.total)}</span>
                <span className={cn("text-[11px] px-1.5 py-0.5 rounded-full font-medium shrink-0", ESTIMATE_STATE_STYLE[state])}>{te(`state_${state}`)}</span>
              </button>
            );
          })}
          {canInvoice && (
            <Button className="w-full" variant="outline" onClick={() => { onOpenChange(false); setEstimateOpen(true); }}>
              <FileText className="w-4 h-4 mr-2" />
              {t("createEstimate")}
            </Button>
          )}
          {canPrescribe && (
            <Button className="w-full" variant="outline" onClick={createPrescription}>
              <Pill className="w-4 h-4 mr-2" />
              {t("createPrescription")}
            </Button>
          )}
          {canMedical && !docs?.record && (
            <Button className="w-full" variant="outline" onClick={openRecord}>
              <Stethoscope className="w-4 h-4 mr-2" />
              {t("createMedicalRecord")}
            </Button>
          )}
    </>
  );

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: typeCfg.bg }}
            >
              <Clock className="w-5 h-5" style={{ color: typeCfg.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight">{appointment.title}</SheetTitle>
              <p className="text-sm text-muted-foreground capitalize mt-0.5">
                {cfgLabel(t, typeCfg)}
                <span className="ml-1.5 font-mono text-xs">{formatAppointmentId(appointment.number)}</span>
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-5 px-5 pb-4">
          {/* Date & time */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("dateTime")}
            </p>
            <p className="font-medium text-sm capitalize">
              {format(new Date(appointment.startTime), "EEEE, d MMMM yyyy", { locale: dateLocale })}
            </p>
            <p className="text-sm text-muted-foreground">
              {format(new Date(appointment.startTime), "HH:mm")} —{" "}
              {format(new Date(appointment.endTime), "HH:mm")}
              <span className="ml-2 text-xs">({duration} min)</span>
            </p>
          </div>

          <Separator />

          {/* Status */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("status")}
            </p>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", stCfg.className)}>
                {t(stCfg.label)}
              </span>
            </div>
            <Select
              value={appointment.status}
              onValueChange={(v) => handleStatusChange(v ?? "")}
            >
              <SelectTrigger className="h-9">
                <SelectValue>
                  {statusConfig[appointment.status] ? t(statusConfig[appointment.status].label) : appointment.status}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusConfig).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>
                    {t(cfg.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isUpdating && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t("saving")}
              </div>
            )}
          </div>

          <Separator />

          {/* Patient */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("patient")}
            </p>
            <div className="flex items-center gap-2">
              <PawPrint className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">{appointment.pet.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                {appointment.pet.owner.firstName} {appointment.pet.owner.lastName}
              </span>
            </div>
            <a
              href={`tel:${appointment.pet.owner.phone}`}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Phone className="w-4 h-4" />
              {appointment.pet.owner.phone}
            </a>
          </div>

          <Separator />

          {/* Veterinarian */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("veterinarian")}
            </p>
            <p className="text-sm font-medium">{appointment.veterinarian.name}</p>
          </div>

          {/* Services (main + extra) */}
          {appointment.service && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("services")}
              </p>
              <ul className="text-sm space-y-0.5">
                {[appointment.service, ...(appointment.extraServices ?? [])].map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color ?? "#9CA3AF" }} />
                    {servicePath(services, s.id, s.name)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Room */}
          {appointment.room && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {tr("room")}
              </p>
              <p className="text-sm font-semibold flex items-center gap-2" style={{ color: appointment.room.color }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: appointment.room.color }} />
                {appointment.room.name}
              </p>
            </div>
          )}

          {/* Notes */}
          {appointment.notes && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t("notes")}
                </p>
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground">{appointment.notes}</p>
                </div>
              </div>
            </>
          )}
          <div className="md:hidden space-y-2 pt-4 border-t border-border">{visitActions}</div>
        </div>

        {/* Actions: documents and create buttons (desktop here; on a phone at the end of the details,
            so they don't cover the screen), then edit / delete */}
        <div className="pt-4 px-5 pb-5 border-t border-border space-y-2">
          <div className="hidden md:block space-y-2">{visitActions}</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
          <Button className="w-full bg-primary text-primary-foreground" onClick={onEdit}>
            <Pencil className="w-4 h-4 mr-2" />
            {t("edit")}
          </Button>
          <Button
            variant="outline"
            className="w-full text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            {tc("delete")}
          </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
    <InvoiceSheetHost invoiceId={billId} onClose={() => setBillId(null)} />
    <InvoiceDialog
      open={!!newBill}
      onOpenChange={(v) => { if (!v) setNewBill(undefined); }}
      services={services}
      presetAppointment={newBill}
      onSaved={(inv) => { setNewBill(undefined); setBillId(inv.id); }}
    />
    {rx.open && (
      <PrescriptionDialog
        open
        onOpenChange={(v) => { if (!v) setRx({ open: false }); }}
        petId={appointment.petId}
        petName={appointment.pet.name}
        veterinarianId={appointment.veterinarianId}
        appointmentId={appointment.id}
        appointmentTitle={appointment.title}
        record={rx.record}
        onSaved={() => setRx({ open: false })}
        onDeleted={() => setRx({ open: false })}
      />
    )}
    <VisitMedicalRecordDialog appointmentId={recordVisit} onClose={() => setRecordVisit(null)} onDeleted={() => {}} onSaved={() => {}} />
    {/* Like the bill, prescription and record: the menu closes and the form opens on its own */}
    {(estimateOpen || editingEstimate) && (
      <EstimateDialog
        open
        onOpenChange={(v) => { if (!v) { setEstimateOpen(false); setEditingEstimate(null); } }}
        estimate={editingEstimate ?? undefined}
        onSaved={estimateSaved}
        onDeleted={(id) => setEstimates((prev) => prev.filter((x) => x.id !== id))}
        petId={appointment.petId}
        petName={appointment.pet.name}
        appointmentId={appointment.id}
        presetTitle={appointment.title}
        presetServiceIds={[...(appointment.serviceId ? [appointment.serviceId] : []), ...(appointment.extraServices ?? []).map((s) => s.id)]}
      />
    )}
    </>
  );
}

// One document of the visit in its menu: opens it; `extra` for a quick action such as printing
function DocRow({
  icon: Icon,
  label,
  badge,
  badgeTone,
  extra,
  onClick,
}: {
  icon: React.ElementType;
  label: React.ReactNode;
  badge?: string;
  badgeTone?: "ok" | "warn" | "muted";
  extra?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === "Enter" && onClick()} className="w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/40 cursor-pointer">
      <Icon className="w-4 h-4 text-primary shrink-0" />
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {badge && (
        <span
          className={cn(
            "text-[11px] px-1.5 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap",
            badgeTone === "ok" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
            badgeTone === "warn" && "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
            badgeTone === "muted" && "bg-muted text-muted-foreground"
          )}
        >
          {badge}
        </span>
      )}
      {extra}
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </div>
  );
}
