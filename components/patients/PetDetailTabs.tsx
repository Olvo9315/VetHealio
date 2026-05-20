"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MedicalTimeline } from "./MedicalTimeline";
import { VaccinationsList } from "./VaccinationsList";
import type { PetFull } from "@/lib/types";
import { format } from "date-fns";
import { Calendar, DollarSign, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const appointmentStatusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  NO_SHOW: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
};

const statusLabel: Record<string, string> = {
  SCHEDULED: "Programada",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No se presentó",
};

interface PetDetailTabsProps {
  pet: PetFull;
}

export function PetDetailTabs({ pet }: PetDetailTabsProps) {
  const t = useTranslations("patients");

  return (
    <Tabs defaultValue="medical">
      <TabsList className="w-full justify-start overflow-x-auto rounded-none border-b border-border bg-transparent h-auto p-0 gap-0">
        {(["medical", "vaccinations", "appointments", "finances"] as const).map((tab) => (
          <TabsTrigger
            key={tab}
            value={tab}
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-4 py-2.5 text-sm font-medium"
          >
            {tab === "medical" && t("medicalHistory")}
            {tab === "vaccinations" && t("vaccinations")}
            {tab === "appointments" && t("appointments")}
            {tab === "finances" && t("finances")}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Medical records */}
      <TabsContent value="medical" className="mt-4">
        <MedicalTimeline records={pet.medicalRecords} />
      </TabsContent>

      {/* Vaccinations */}
      <TabsContent value="vaccinations" className="mt-4">
        <VaccinationsList vaccinations={pet.vaccinations} />
      </TabsContent>

      {/* Appointments */}
      <TabsContent value="appointments" className="mt-4">
        {pet.appointments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin citas registradas</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pet.appointments.map((apt) => (
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
                  {statusLabel[apt.status] ?? apt.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* Finances */}
      <TabsContent value="finances" className="mt-4">
        {pet.appointments.every((a) => !a.invoice) ? (
          <div className="text-center py-12 text-muted-foreground">
            <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin facturas</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pet.appointments
              .filter((a) => a.invoice)
              .map((apt) => (
                <div
                  key={apt.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                >
                  <div>
                    <p className="font-medium text-sm">{apt.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(apt.startTime), "dd/MM/yyyy")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">${apt.invoice!.totalAmount}</p>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        apt.invoice!.status === "PAID"
                          ? "text-emerald-600"
                          : apt.invoice!.status === "PENDING"
                          ? "text-amber-600"
                          : "text-muted-foreground"
                      )}
                    >
                      {apt.invoice!.status === "PAID"
                        ? "Pagado"
                        : apt.invoice!.status === "PENDING"
                        ? "Pendiente"
                        : "Cancelado"}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
