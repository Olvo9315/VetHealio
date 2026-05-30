"use client";

import { useState, useMemo } from "react";
import { format, addDays, subDays, isToday, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import type { AppointmentFull } from "@/lib/actions/appointments";
import { typeConfig, statusConfig } from "./AppointmentConfig";
import { AppointmentDetailSheet } from "./AppointmentDetailSheet";
import { AppointmentDialog } from "./AppointmentDialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Vet = { id: string; name: string; role: string };

interface MobileAppointmentListProps {
  initialAppointments: AppointmentFull[];
  vets: Vet[];
}

export function MobileAppointmentList({ initialAppointments, vets }: MobileAppointmentListProps) {
  const [date, setDate] = useState(new Date());
  const [appointments, setAppointments] = useState<AppointmentFull[]>(initialAppointments);
  const [selectedApt, setSelectedApt] = useState<AppointmentFull | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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

  return (
    <div className="flex flex-col gap-4">
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
                  {format(d, "EEE", { locale: es }).slice(0, 2)}
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
          {isToday(date) ? "Hoy · " : ""}
          {format(date, "EEEE, d MMMM", { locale: es })}
        </h2>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground h-8"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Nueva
        </Button>
      </div>

      {/* Appointments list */}
      {dayAppointments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin citas este día</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dayAppointments.map((apt) => {
            const typeCfg = typeConfig[apt.type];
            const stCfg = statusConfig[apt.status];
            const hasConflict = conflictIds.has(apt.id);
            return (
              <button
                key={apt.id}
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
                  <p className="font-medium text-sm truncate">{apt.pet.name}</p>
                  <p className={cn("text-xs truncate", hasConflict ? "text-red-500" : "text-muted-foreground")}>
                    {typeCfg.label} · Dr. {apt.veterinarian.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {apt.pet.owner.firstName} {apt.pet.owner.lastName}
                  </p>
                </div>
                {/* Conflict warning / Status badge */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {hasConflict && (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", stCfg.className)}>
                    {stCfg.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Sheet */}
      {selectedApt && (
        <AppointmentDetailSheet
          open={detailOpen}
          onOpenChange={setDetailOpen}
          appointment={selectedApt}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onEdit={() => { setDetailOpen(false); setCreateOpen(true); }}
        />
      )}

      {/* Create Dialog */}
      <AppointmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        vets={vets}
        presetStart={date}
        onSaved={handleSaved}
      />
    </div>
  );
}
