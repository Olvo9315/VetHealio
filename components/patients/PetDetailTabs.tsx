"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { MedicalTimeline } from "./MedicalTimeline";
import { VaccinationsList } from "./VaccinationsList";
import { PrescriptionsList } from "./PrescriptionsList";
import { PrescriptionDialog } from "./PrescriptionDialog";
import { MedicalRecordDialog } from "@/components/medical-records/MedicalRecordDialog";
import { VaccinationDialog } from "./VaccinationDialog";
import { DirectInvoiceDialog } from "./DirectInvoiceDialog";
import { AppointmentDialog } from "@/components/appointments/AppointmentDialog";
import { AppointmentDetailSheet } from "@/components/appointments/AppointmentDetailSheet";
import { VisitMedicalRecordDialog } from "@/components/medical-records/VisitMedicalRecordDialog";
import { InvoiceDetailSheet } from "@/components/finances/InvoiceDetailSheet";
import { InvoiceDialog } from "@/components/finances/InvoiceDialog";
import type { PetFull } from "@/lib/types";
import type { MedicalRecordFull } from "@/lib/actions/medicalRecords";
import type { VaccinationFull } from "@/lib/actions/vaccinations";
import type { InvoiceFull } from "@/lib/actions/invoices";
import type { AppointmentFull } from "@/lib/actions/appointments";
import type { PrescriptionFull } from "@/lib/actions/prescriptions";
import { getVeterinarians, getAppointmentById } from "@/lib/actions/appointments";
import { getInvoiceById, type AppointmentOption } from "@/lib/actions/invoices";
import { getServicesFlat, type ServiceFlat } from "@/lib/actions/services";
import { getRooms, type Room } from "@/lib/actions/rooms";
import { format } from "date-fns";
import { Calendar, DollarSign, Clock, Plus, Receipt, ChevronRight } from "lucide-react";
import { cn, formatAppointmentId, formatInvoiceId } from "@/lib/utils";
import { useCan } from "@/components/layout/PermissionsProvider";

type Tab = "medical" | "vaccinations" | "appointments" | "prescriptions" | "finances";

type Vet = { id: string; name: string; role: string };

function fmt(v: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
}

interface PetDetailTabsProps {
  pet: PetFull;
  // Opened from a link (appointment list, waiting room): show this appointment right away
  initialAppointmentId?: string;
}

export function PetDetailTabs({ pet, initialAppointmentId }: PetDetailTabsProps) {
  const t = useTranslations("patients");
  const canMedical = useCan("medical.write");
  const canPrescribe = useCan("prescription.write");
  const canInvoice = useCan("invoice.write");
  const ta = useTranslations("appointments");
  const tf = useTranslations("finances");
  const tm = useTranslations("medicalRecords");
  const tp = useTranslations("prescriptions");

  const [activeTab, setActiveTab] = useState<Tab>(initialAppointmentId ? "appointments" : "medical");
  const [vets, setVets] = useState<Vet[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [, startVetLoad] = useTransition();

  const [medicalOpen, setMedicalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<typeof pet.medicalRecords[0] | null>(null);
  const [vaccinationOpen, setVaccinationOpen] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [prescriptionOpen, setPrescriptionOpen] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState<PrescriptionFull | null>(null);
  const [editingVaccination, setEditingVaccination] = useState<VaccinationFull | null>(null);

  // An appointment opened from the list, and what can be done from it
  const [openApt, setOpenApt] = useState<AppointmentFull | null>(null);
  const [aptSheetOpen, setAptSheetOpen] = useState(false);
  const [editingApt, setEditingApt] = useState<AppointmentFull | null>(null);
  const [aptPrescription, setAptPrescription] = useState<AppointmentFull | null>(null);
  const [recordVisitId, setRecordVisitId] = useState<string | null>(null);
  const [aptInvoice, setAptInvoice] = useState<AppointmentOption | undefined>();

  // An invoice opened from the list
  const [openInvoice, setOpenInvoice] = useState<InvoiceFull | null>(null);
  const [invoiceSheetOpen, setInvoiceSheetOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceFull | null>(null);
  // Service catalog for invoices; loaded the first time one is opened
  const [services, setServices] = useState<ServiceFlat[] | null>(null);

  const [medicalRecords, setMedicalRecords] = useState(pet.medicalRecords);
  const [vaccinations, setVaccinations] = useState(pet.vaccinations);
  const [appointments, setAppointments] = useState(pet.appointments);
  const [invoices, setInvoices] = useState(pet.invoices);
  const [prescriptions, setPrescriptions] = useState<PrescriptionFull[]>(
    (pet.prescriptions ?? []) as PrescriptionFull[]
  );

  const presetPet = {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    owner: pet.owner,
  };

  useEffect(() => {
    startVetLoad(async () => {
      const [data, roomList] = await Promise.all([getVeterinarians(), getRooms()]);
      setVets(data);
      setRooms(roomList);
    });
  }, []);

  async function loadServices() {
    if (services) return services;
    const list = await getServicesFlat();
    setServices(list);
    return list;
  }

  useEffect(() => {
    if (initialAppointmentId) openAppointment(initialAppointmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAppointmentId]);

  async function openAppointment(id: string) {
    const [apt] = await Promise.all([getAppointmentById(id), loadServices()]);
    if (!apt) return;
    setOpenApt(apt);
    setAptSheetOpen(true);
  }

  async function openInvoiceDetail(id: string) {
    const [inv] = await Promise.all([getInvoiceById(id), loadServices()]);
    if (!inv) return;
    setOpenInvoice(inv);
    setInvoiceSheetOpen(true);
  }

  function invoiceFromAppointment(apt: AppointmentFull) {
    const withPrice = (sv: { id: string; name: string; officialName?: string }) => ({
      ...sv,
      price: services?.find((x) => x.id === sv.id)?.price ?? null,
    });
    setAptInvoice({
      id: apt.id,
      title: apt.title,
      startTime: apt.startTime,
      type: apt.type,
      service: apt.service ? withPrice(apt.service) : null,
      extraServices: (apt.extraServices ?? []).map(withPrice),
      pet: apt.pet,
    });
  }

  function handleMedicalDeleted(id: string) {
    setMedicalRecords((prev) => prev.filter((r) => r.id !== id));
  }

  function handleMedicalSaved(record: MedicalRecordFull) {
    setMedicalRecords((prev) => {
      const exists = prev.find((r) => r.id === record.id);
      if (exists) return prev.map((r) => (r.id === record.id ? (record as typeof prev[0]) : r));
      return [record as typeof prev[0], ...prev];
    });
  }

  function handleVaccinationSaved(v: VaccinationFull) {
    setVaccinations((prev) => {
      const exists = prev.find((x) => x.id === v.id);
      if (exists) return prev.map((x) => (x.id === v.id ? (v as typeof prev[0]) : x));
      return [v as typeof prev[0], ...prev];
    });
  }

  function handleAppointmentSaved(apt: AppointmentFull) {
    setAppointments((prev) => {
      const exists = prev.find((a) => a.id === apt.id);
      const mapped = {
        id: apt.id,
        number: apt.number,
        title: apt.title,
        startTime: apt.startTime,
        endTime: apt.endTime,
        status: apt.status,
        type: apt.type,
        veterinarian: apt.veterinarian,
        invoice: null,
      } as typeof prev[0];
      if (exists) return prev.map((a) => (a.id === apt.id ? mapped : a));
      return [mapped, ...prev];
    });
  }

  function handlePrescriptionSaved(p: PrescriptionFull) {
    setPrescriptions((prev) => {
      const exists = prev.find((x) => x.id === p.id);
      if (exists) return prev.map((x) => (x.id === p.id ? p : x));
      return [p, ...prev];
    });
  }

  function handleInvoiceSaved(invoice: InvoiceFull) {
    setInvoices((prev) => {
      if (prev.some((x) => x.id === invoice.id)) {
        return prev.map((x) =>
          x.id === invoice.id ? { ...x, status: invoice.status, totalAmount: invoice.totalAmount, items: invoice.items } : x
        );
      }
      return [
      {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        totalAmount: invoice.totalAmount,
        createdAt: invoice.createdAt,
        appointmentId: invoice.appointmentId,
        appointment: invoice.appointment
          ? { title: invoice.appointment.title, startTime: invoice.appointment.startTime }
          : null,
        items: invoice.items,
      } as typeof prev[0],
      ...prev,
      ];
    });
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "medical", label: t("medicalHistory"), count: medicalRecords.length },
    { id: "vaccinations", label: t("vaccinations"), count: vaccinations.length },
    { id: "appointments", label: t("appointments"), count: appointments.length },
    { id: "prescriptions", label: t("prescriptions"), count: prescriptions.length },
    { id: "finances", label: t("finances"), count: invoices.length },
  ];

  const appointmentStatusColors: Record<string, string> = {
    SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    ARRIVED: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    NO_SHOW: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
  };

  const appointmentStatusLabel: Record<string, string> = {
    SCHEDULED: ta("scheduled"),
    ARRIVED: ta("arrived"),
    IN_PROGRESS: ta("inProgress"),
    COMPLETED: ta("completed"),
    CANCELLED: ta("cancelled"),
    NO_SHOW: ta("noShow"),
  };

  const invoiceStatusColors: Record<string, string> = {
    PENDING: "text-amber-600",
    PAID: "text-emerald-600",
    CANCELLED: "text-muted-foreground",
  };

  const invoiceStatusLabel: Record<string, string> = {
    PENDING: tf("pending"),
    PAID: tf("paid"),
    CANCELLED: tf("cancelled"),
  };

  return (
    <>
      {/* Tab bar */}
      <div className="border-b border-border">
        <div className="flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full font-medium",
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="pt-4">

        {/* Medical records */}
        {activeTab === "medical" && (
          <div>
            <div className="flex justify-end mb-3">
              {canMedical && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground h-8 text-xs"
                onClick={() => setMedicalOpen(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {tm("new")}
              </Button>
              )}
            </div>
            <MedicalTimeline
              records={medicalRecords as React.ComponentProps<typeof MedicalTimeline>["records"]}
              onEdit={(record) => setEditingRecord(record as typeof pet.medicalRecords[0])}
            />
          </div>
        )}

        {/* Vaccinations */}
        {activeTab === "vaccinations" && (
          <div>
            <div className="flex justify-end mb-3">
              {canMedical && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground h-8 text-xs"
                onClick={() => setVaccinationOpen(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {t("newVaccination")}
              </Button>
              )}
            </div>
            <VaccinationsList
              vaccinations={vaccinations}
              onEdit={canMedical ? (v) => setEditingVaccination(v as unknown as VaccinationFull) : undefined}
            />
          </div>
        )}

        {/* Appointments */}
        {activeTab === "appointments" && (
          <div>
            <div className="flex justify-end mb-3">
              <Button
                size="sm"
                className="bg-primary text-primary-foreground h-8 text-xs"
                onClick={() => setAppointmentOpen(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {ta("new")}
              </Button>
            </div>
            {appointments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("noAppointments")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {appointments.map((apt) => (
                  <button
                    key={apt.id}
                    type="button"
                    onClick={() => openAppointment(apt.id)}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 hover:border-primary/40 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{apt.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(apt.startTime), "dd/MM/yyyy HH:mm")} · {apt.veterinarian.name} · {formatAppointmentId(apt.number)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full shrink-0",
                        appointmentStatusColors[apt.status]
                      )}
                    >
                      {appointmentStatusLabel[apt.status] ?? apt.status}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Prescriptions */}
        {activeTab === "prescriptions" && (
          <div>
            <div className="flex justify-end mb-3">
              {canPrescribe && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground h-8 text-xs"
                onClick={() => setPrescriptionOpen(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {tp("new")}
              </Button>
              )}
            </div>
            <PrescriptionsList
              prescriptions={prescriptions}
              onEdit={(p) => setEditingPrescription(p)}
            />
          </div>
        )}

        {/* Finances */}
        {activeTab === "finances" && (
          <div>
            <div className="flex justify-end mb-3">
              {canInvoice && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground h-8 text-xs"
                onClick={() => setInvoiceOpen(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {tf("newInvoice")}
              </Button>
              )}
            </div>
            {invoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("noInvoices")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => openInvoiceDetail(inv.id)}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 hover:border-primary/40 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {inv.appointment?.title ?? tf("noAppointment")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(inv.createdAt), "dd/MM/yyyy")} · {formatInvoiceId(inv.number, inv.createdAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">{fmt(inv.totalAmount)}</p>
                      <span className={cn("text-xs font-medium", invoiceStatusColors[inv.status])}>
                        {invoiceStatusLabel[inv.status] ?? inv.status}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Dialogs */}
      <MedicalRecordDialog
        open={medicalOpen}
        onOpenChange={setMedicalOpen}
        presetPetId={pet.id}
        presetPetName={pet.name}
        appointments={appointments.filter((a) => a.status !== "CANCELLED")}
        onSaved={handleMedicalSaved}
      />

      {editingRecord && (
        <MedicalRecordDialog
          open={!!editingRecord}
          onOpenChange={(v) => { if (!v) setEditingRecord(null); }}
          presetPetId={pet.id}
          presetPetName={pet.name}
          record={editingRecord as unknown as import("@/lib/actions/medicalRecords").MedicalRecordFull}
          onSaved={(record) => { handleMedicalSaved(record); setEditingRecord(null); }}
          onDeleted={handleMedicalDeleted}
        />
      )}

      <VisitMedicalRecordDialog
        appointmentId={recordVisitId}
        onClose={() => setRecordVisitId(null)}
        onSaved={handleMedicalSaved}
        onDeleted={handleMedicalDeleted}
      />

      {editingVaccination && (
        <VaccinationDialog
          open={!!editingVaccination}
          onOpenChange={(v) => { if (!v) setEditingVaccination(null); }}
          vaccination={editingVaccination}
          presetPetId={pet.id}
          presetPetName={pet.name}
          onSaved={(v) => { handleVaccinationSaved(v); setEditingVaccination(null); }}
          onDeleted={(id) => setVaccinations((prev) => prev.filter((x) => x.id !== id))}
        />
      )}

      {openApt && (
        <AppointmentDetailSheet
          open={aptSheetOpen}
          onOpenChange={setAptSheetOpen}
          appointment={openApt}
          services={services ?? []}
          onUpdated={(apt) => { setOpenApt(apt); handleAppointmentSaved(apt); }}
          onDeleted={(id) => { setAppointments((prev) => prev.filter((a) => a.id !== id)); setAptSheetOpen(false); }}
          onEdit={() => { setEditingApt(openApt); setAptSheetOpen(false); }}
          onCreateInvoice={() => { invoiceFromAppointment(openApt); setAptSheetOpen(false); }}
          onCreatePrescription={() => { setAptPrescription(openApt); setAptSheetOpen(false); }}
          onCreateMedicalRecord={() => { setRecordVisitId(openApt.id); setAptSheetOpen(false); }}
        />
      )}

      {editingApt && vets.length > 0 && (
        <AppointmentDialog
          open={!!editingApt}
          onOpenChange={(v) => { if (!v) setEditingApt(null); }}
          vets={vets}
          rooms={rooms}
          services={services ?? undefined}
          appointment={editingApt}
          onSaved={(apt) => { handleAppointmentSaved(apt); setEditingApt(null); }}
        />
      )}

      {aptPrescription && (
        <PrescriptionDialog
          open={!!aptPrescription}
          onOpenChange={(v) => { if (!v) setAptPrescription(null); }}
          petId={pet.id}
          petName={pet.name}
          veterinarianId={aptPrescription.veterinarianId}
          appointmentId={aptPrescription.id}
          appointmentTitle={aptPrescription.title}
          onSaved={(p) => { handlePrescriptionSaved(p); setAptPrescription(null); }}
        />
      )}

      {services && (
        <InvoiceDialog
          open={!!aptInvoice}
          onOpenChange={(v) => { if (!v) setAptInvoice(undefined); }}
          services={services}
          presetAppointment={aptInvoice}
          onSaved={(inv) => { handleInvoiceSaved(inv); setAptInvoice(undefined); }}
        />
      )}

      {openInvoice && (
        <InvoiceDetailSheet
          open={invoiceSheetOpen}
          onOpenChange={setInvoiceSheetOpen}
          invoice={openInvoice}
          onUpdated={(inv) => { setOpenInvoice(inv); handleInvoiceSaved(inv); }}
          onDeleted={(id) => { setInvoices((prev) => prev.filter((x) => x.id !== id)); setInvoiceSheetOpen(false); }}
          onEdit={() => { setEditingInvoice(openInvoice); setInvoiceSheetOpen(false); }}
        />
      )}

      {editingInvoice && services && (
        <InvoiceDialog
          open={!!editingInvoice}
          onOpenChange={(v) => { if (!v) setEditingInvoice(null); }}
          invoice={editingInvoice}
          services={services}
          onSaved={(inv) => { handleInvoiceSaved(inv); setEditingInvoice(null); }}
        />
      )}

      <VaccinationDialog
        open={vaccinationOpen}
        onOpenChange={setVaccinationOpen}
        presetPetId={pet.id}
        presetPetName={pet.name}
        onSaved={handleVaccinationSaved}
      />

      {vets.length > 0 && (
        <AppointmentDialog
          open={appointmentOpen}
          onOpenChange={setAppointmentOpen}
          vets={vets}
          rooms={rooms}
          presetPet={presetPet}
          onSaved={handleAppointmentSaved}
        />
      )}

      <DirectInvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        presetPetId={pet.id}
        presetPetName={pet.name}
        onSaved={handleInvoiceSaved}
      />

      {prescriptionOpen && (
        <PrescriptionDialog
          open={prescriptionOpen}
          onOpenChange={setPrescriptionOpen}
          petId={pet.id}
          petName={pet.name}
          onSaved={(p) => { handlePrescriptionSaved(p); setPrescriptionOpen(false); }}
        />
      )}

      {editingPrescription && (
        <PrescriptionDialog
          open={!!editingPrescription}
          onOpenChange={(v) => { if (!v) setEditingPrescription(null); }}
          petId={pet.id}
          petName={pet.name}
          record={editingPrescription}
          onSaved={(p) => { handlePrescriptionSaved(p); setEditingPrescription(null); }}
          onDeleted={(id) => setPrescriptions((prev) => prev.filter((x) => x.id !== id))}
        />
      )}
    </>
  );
}
