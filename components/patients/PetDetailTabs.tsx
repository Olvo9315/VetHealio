"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { MedicalTimeline } from "./MedicalTimeline";
import { VaccinationsList } from "./VaccinationsList";
import { MedicalRecordDialog } from "@/components/medical-records/MedicalRecordDialog";
import { VaccinationDialog } from "./VaccinationDialog";
import { DirectInvoiceDialog } from "./DirectInvoiceDialog";
import { AppointmentDialog } from "@/components/appointments/AppointmentDialog";
import type { PetFull } from "@/lib/types";
import type { MedicalRecordFull } from "@/lib/actions/medicalRecords";
import type { VaccinationFull } from "@/lib/actions/vaccinations";
import type { InvoiceFull } from "@/lib/actions/invoices";
import type { AppointmentFull } from "@/lib/actions/appointments";
import { getVeterinarians } from "@/lib/actions/appointments";
import { format } from "date-fns";
import { Calendar, DollarSign, Clock, Plus, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "medical" | "vaccinations" | "appointments" | "finances";

type Vet = { id: string; name: string; role: string };

function fmt(v: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
}

interface PetDetailTabsProps {
  pet: PetFull;
}

export function PetDetailTabs({ pet }: PetDetailTabsProps) {
  const t = useTranslations("patients");
  const ta = useTranslations("appointments");
  const tf = useTranslations("finances");
  const tm = useTranslations("medicalRecords");

  const [activeTab, setActiveTab] = useState<Tab>("medical");
  const [vets, setVets] = useState<Vet[]>([]);
  const [, startVetLoad] = useTransition();

  const [medicalOpen, setMedicalOpen] = useState(false);
  const [vaccinationOpen, setVaccinationOpen] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const [medicalRecords, setMedicalRecords] = useState(pet.medicalRecords);
  const [vaccinations, setVaccinations] = useState(pet.vaccinations);
  const [appointments, setAppointments] = useState(pet.appointments);
  const [invoices, setInvoices] = useState(pet.invoices);

  const presetPet = {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    owner: pet.owner,
  };

  useEffect(() => {
    startVetLoad(async () => {
      const data = await getVeterinarians();
      setVets(data);
    });
  }, []);

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

  function handleInvoiceSaved(invoice: InvoiceFull) {
    setInvoices((prev) => [
      {
        id: invoice.id,
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
    ]);
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "medical", label: t("medicalHistory"), count: medicalRecords.length },
    { id: "vaccinations", label: t("vaccinations"), count: vaccinations.length },
    { id: "appointments", label: t("appointments"), count: appointments.length },
    { id: "finances", label: t("finances"), count: invoices.length },
  ];

  const appointmentStatusColors: Record<string, string> = {
    SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    NO_SHOW: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
  };

  const appointmentStatusLabel: Record<string, string> = {
    SCHEDULED: ta("scheduled"),
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
              <Button
                size="sm"
                className="bg-primary text-primary-foreground h-8 text-xs"
                onClick={() => setMedicalOpen(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {tm("new")}
              </Button>
            </div>
            <MedicalTimeline records={medicalRecords} />
          </div>
        )}

        {/* Vaccinations */}
        {activeTab === "vaccinations" && (
          <div>
            <div className="flex justify-end mb-3">
              <Button
                size="sm"
                className="bg-primary text-primary-foreground h-8 text-xs"
                onClick={() => setVaccinationOpen(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {t("newVaccination")}
              </Button>
            </div>
            <VaccinationsList vaccinations={vaccinations} />
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
                  <div
                    key={apt.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{apt.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(apt.startTime), "dd/MM/yyyy HH:mm")} · {apt.veterinarian.name}
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Finances */}
        {activeTab === "finances" && (
          <div>
            <div className="flex justify-end mb-3">
              <Button
                size="sm"
                className="bg-primary text-primary-foreground h-8 text-xs"
                onClick={() => setInvoiceOpen(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {tf("newInvoice")}
              </Button>
            </div>
            {invoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("noInvoices")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {inv.appointment?.title ?? tf("noAppointment")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(inv.createdAt), "dd/MM/yyyy")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">{fmt(inv.totalAmount)}</p>
                      <span className={cn("text-xs font-medium", invoiceStatusColors[inv.status])}>
                        {invoiceStatusLabel[inv.status] ?? inv.status}
                      </span>
                    </div>
                  </div>
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
        onSaved={handleMedicalSaved}
      />

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
    </>
  );
}
