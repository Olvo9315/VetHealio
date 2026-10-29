"use client";

import { useState, useMemo } from "react";
import { format, addDays, subDays, isToday, isSameDay } from "date-fns";
import { useDateLocale } from "@/lib/date-locale";
import type { AppointmentFull } from "@/lib/actions/appointments";
import { getTypeCfgForAppointment, statusConfig, cfgLabel } from "./AppointmentConfig";
import { useTranslations } from "next-intl";
import type { ServiceFlat } from "@/lib/actions/services";
import { AppointmentDetailSheet } from "./AppointmentDetailSheet";
import { AppointmentDialog } from "./AppointmentDialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Clock, AlertTriangle, Stethoscope, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Room } from "@/lib/actions/rooms";
import type { CalendarLeave } from "@/lib/actions/appointments";
import { Views } from "react-big-calendar";
import { useCalendarI18n } from "@/lib/calendar-i18n";
import { AppointmentsCalendar } from "./AppointmentsCalendar";
import { PetQuickSheet, type PetPreview } from "@/components/patients/PetQuickSheet";
import { servicePath } from "@/lib/service-path";

type Vet = { id: string; name: string; role: string };

interface MobileAppointmentListProps {
  initialAppointments: AppointmentFull[];
  vets: Vet[];
  services: ServiceFlat[];
  rooms: Room[];
  leaves?: CalendarLeave[];
}

export function MobileAppointmentList({ initialAppointments, vets, services, rooms, leaves = [] }: MobileAppointmentListProps) {
  const dateLocale = useDateLocale();
  const t = useTranslations("appointments");
  const [date, setDate] = useState(new Date());
  // Day = the list below; week and month use the desktop calendar in its phone layout
  const [mode, setMode] = useState<"day" | "week" | "month">("day");
  const calendarI18n = useCalendarI18n();
  const [appointments, setAppointments] = useState<AppointmentFull[]>(initialAppointments);
  const [selectedApt, setSelectedApt] = useState<AppointmentFull | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingApt, setEditingApt] = useState<AppointmentFull | null>(null);
  // Tap on the pet name: quick pet card in a bottom sheet, closes back to the list
  const [petPreview, setPetPreview] = useState<PetPreview | null>(null);

  function serviceLabel(apt: AppointmentFull) {
    if (!apt.service) return undefined;
    return servicePath(services, apt.service.id, apt.service.name);
  }

  const dayAppointments = appointments
    .filter((a) => isSameDay(new Date(a.startTime), date))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < dayAppointments.length; i++) {
      for (let j = i + 1; j < dayAppointments.length; j++) {
        const a = dayAppointments[i], b = dayAppointments[j];
        if (
          a.veterinarianId === b.veterinarianId &&
          new Date(a.startTime) < new Date(b.endTime) &&
          new Date(a.endTime) > new Date(b.startTime)
        ) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [dayAppointments]);

  function handleUpdated(apt: AppointmentFull) {
    setAppointments((prev) => prev.map((a) => (a.id === apt.id ? apt : a)));
    setSelectedApt(apt);
  }

  function handleDeleted(id: string) {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    setDetailOpen(false);
  }

  function handleSaved(apt: AppointmentFull) {
    setAppointments((prev) => {
      const exists = prev.find((a) => a.id === apt.id);
      return exists ? prev.map((a) => (a.id === apt.id ? apt : a)) : [apt, ...prev];
    });
  }

  // Build week strip (7 days centred on today)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(subDays(date, 3), i));

  const modeSwitch = (
    <div className="flex rounded-lg border border-border overflow-hidden self-start">
      {(["day", "week", "month"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={cn(
            "px-3 py-1.5 text-sm transition-colors",
            mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
          )}
        >
          {calendarI18n.messages[m]}
        </button>
      ))}
    </div>
  );

  if (mode !== "day") {
    return (
      <div className="flex flex-col gap-3">
        {modeSwitch}
        <AppointmentsCalendar
          key={mode}
          mobile
          initialView={mode === "week" ? Views.WEEK : Views.MONTH}
          initialAppointments={appointments}
          vets={vets}
          services={services}
          rooms={rooms}
          leaves={leaves}
          onAppointmentsChange={setAppointments}
          onOpenDay={(day) => { setDate(day); setMode("day"); }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {modeSwitch}

      {/* Week strip */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => setDate((d) => subDays(d, 7))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex flex-1 gap-1 overflow-x-auto no-scrollbar">
          {weekDays.map((d) => {
            const hasApts = appointments.some((a) => isSameDay(new Date(a.startTime), d));
            const selected = isSameDay(d, date);
            return (
              <button
                key={d.toISOString()}
                onClick={() => setDate(d)}
                className={cn(
                  "flex flex-col items-center py-1.5 px-2 rounded-xl flex-1 min-w-[40px] transition-colors",
                  selected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                <span className="text-[10px] uppercase font-medium opacity-70">
                  {format(d, "EEE", { locale: dateLocale }).slice(0, 2)}
                </span>
                <span className={cn("text-base font-bold", isToday(d) && !selected && "text-primary")}>
                  {format(d, "d")}
                </span>
                {hasApts && (
                  <span className={cn("w-1.5 h-1.5 rounded-full mt-0.5", selected ? "bg-primary-foreground" : "bg-primary")} />
                )}
              </button>
            );
          })}
        </div>
        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => setDate((d) => addDays(d, 7))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Date header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold capitalize">
          {isToday(date) ? t("todayPrefix") : ""}
          {format(date, "EEEE, d MMMM", { locale: dateLocale })}
        </h2>
        {/* Back to today from any other day */}
        {!isToday(date) && (
          <Button variant="outline" size="sm" className="h-8 ml-auto mr-2" onClick={() => setDate(new Date())}>
            {calendarI18n.messages.today}
          </Button>
        )}
        <Button
          size="sm"
          className="bg-primary text-primary-foreground h-8"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          {t("newShort")}
        </Button>
      </div>

      {/* Appointments list */}
      {dayAppointments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t("noneThisDay")}</p>
        </div>
      ) : (
        // Re-keyed per day so the cards slide in from top to bottom each time the day changes
        <div key={date.toDateString()} className="space-y-2 vh-list-in">
          {dayAppointments.map((apt, index) => {
            const typeCfg = getTypeCfgForAppointment(apt);
            const stCfg = statusConfig[apt.status];
            const hasConflict = conflictIds.has(apt.id);
            return (
              <button
                key={apt.id}
                style={{ "--i": index } as React.CSSProperties}
                className={cn(
                  "w-full flex items-start gap-3 p-3 rounded-xl border bg-card hover:bg-muted/40 transition-colors text-left",
                  hasConflict ? "border-red-400 dark:border-red-600" : "border-border"
                )}
                onClick={() => { setSelectedApt(apt); setDetailOpen(true); }}
              >
                {/* Color bar */}
                <div
                  className="w-1 self-stretch rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: hasConflict ? "#ef4444" : typeCfg.border }}
                />
                {/* Time */}
                <div className="text-xs font-mono text-muted-foreground w-10 shrink-0 pt-0.5">
                  {format(new Date(apt.startTime), "HH:mm")}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    <span
                      role="button"
                      tabIndex={0}
                      className="underline decoration-dotted underline-offset-2"
                      onClick={(e) => { e.stopPropagation(); setPetPreview({ id: apt.petId, name: apt.pet.name }); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.stopPropagation(); e.preventDefault(); setPetPreview({ id: apt.petId, name: apt.pet.name }); }
                      }}
                    >
                      {apt.pet.name}
                    </span>
                    {apt.presvetPending && <ShieldAlert className="inline w-3.5 h-3.5 ml-1 text-amber-600" aria-label={t("presvetPending")} />}
                  </p>
                  {/* Full "Category › Sub-service" (wraps instead of being cut off) */}
                  <p className="text-xs text-foreground/80 leading-snug">
                    {serviceLabel(apt) ?? cfgLabel(t, typeCfg)}
                    {!!apt.extraServices?.length && `, ${apt.extraServices.map((s) => servicePath(services, s.id, s.name)).join(", ")}`}
                  </p>
                  <p className={cn("text-xs truncate flex items-center gap-1", hasConflict ? "text-red-500" : "text-muted-foreground")}>
                    <Stethoscope className="w-3 h-3 shrink-0" />
                    {apt.veterinarian.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {apt.pet.owner.firstName} {apt.pet.owner.lastName}
                    {apt.room && (
                      <span className="font-semibold" style={{ color: apt.room.color }}> · {apt.room.name}</span>
                    )}
                  </p>
                </div>
                {/* Conflict warning / Status badge */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {hasConflict && (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", stCfg.className)}>
                    {t(stCfg.label)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pet quick card */}
      <PetQuickSheet pet={petPreview} onClose={() => setPetPreview(null)} />

      {/* Detail Sheet */}
      {selectedApt && (
        <AppointmentDetailSheet
          open={detailOpen}
          services={services}
          onOpenChange={setDetailOpen}
          appointment={selectedApt}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onEdit={() => { setEditingApt(selectedApt); setDetailOpen(false); setCreateOpen(true); }}
        />
      )}

      {/* Create / Edit Dialog */}
      {createOpen && (
        <AppointmentDialog
          open={createOpen}
          onOpenChange={(v) => { if (!v) { setCreateOpen(false); setEditingApt(null); } }}
          vets={vets}
          services={services}
          rooms={rooms}
          appointment={editingApt ?? undefined}
          presetStart={editingApt ? undefined : date}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
