"use client";

import { useState, useCallback, useMemo, useTransition, useRef } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
  type SlotInfo,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { format, parse, startOfWeek, getDay, addMonths, addWeeks } from "date-fns";
import { es } from "date-fns/locale";
import type { AppointmentFull } from "@/lib/actions/appointments";
import { updateAppointmentTime } from "@/lib/actions/appointments";
import { getEventStyle, typeConfig, statusConfig } from "./AppointmentConfig";
import { AppointmentDialog } from "./AppointmentDialog";
import { AppointmentDetailSheet } from "./AppointmentDetailSheet";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, User, Stethoscope, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const locales = { es };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const DnDCalendar = withDragAndDrop(Calendar);

type CalEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: AppointmentFull;
};

type Vet = { id: string; name: string; role: string };

interface AppointmentsCalendarProps {
  initialAppointments: AppointmentFull[];
  vets: Vet[];
}

const VIEW_LABELS: Record<string, string> = {
  month: "Mes",
  week: "Semana",
  day: "Día",
};

function AppointmentCard({
  apt,
  startTime,
  endTime,
  highlight = false,
  conflict = false,
}: {
  apt: AppointmentFull;
  startTime: Date;
  endTime: Date;
  highlight?: boolean;
  conflict?: boolean;
}) {
  const typeCfg = typeConfig[apt.type];
  const statusCfg = statusConfig[apt.status];
  const durationMin = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

  return (
    <div
      className={cn(
        "px-3 py-2.5 space-y-1.5",
        highlight ? "border-b border-border" : "border-b border-border/50 last:border-0"
      )}
    >
      {/* Pet name + type badge */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p
            className="font-semibold text-sm leading-tight"
            style={{ color: typeCfg.color }}
          >
            {apt.pet.name}
          </p>
          <p className="text-xs opacity-70 leading-tight" style={{ color: typeCfg.color }}>
            {apt.title}
          </p>
        </div>
        <span
          className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: typeCfg.bg, color: typeCfg.color, border: `1px solid ${typeCfg.border}` }}
        >
          {typeCfg.label}
        </span>
      </div>

      {/* Time */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="w-3 h-3 shrink-0" />
        <span>
          {format(startTime, "HH:mm")} – {format(endTime, "HH:mm")}
          <span className="ml-1 opacity-60">({durationMin} min)</span>
        </span>
      </div>

      {/* Vet */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Stethoscope className="w-3 h-3 shrink-0" />
        <span>{apt.veterinarian.name}</span>
        {conflict && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
      </div>

      {/* Owner + phone */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <User className="w-3 h-3 shrink-0" />
        <span>{apt.pet.owner.firstName} {apt.pet.owner.lastName}</span>
        {apt.pet.owner.phone && (
          <span className="text-muted-foreground/60">· {apt.pet.owner.phone}</span>
        )}
      </div>

      {/* Status */}
      <span className={cn("inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full", statusCfg.className)}>
        {statusCfg.label}
      </span>

      {/* Notes */}
      {apt.notes && (
        <p className="text-xs text-muted-foreground border-t border-border/50 pt-1.5 leading-relaxed">
          {apt.notes}
        </p>
      )}
    </div>
  );
}

export function AppointmentsCalendar({ initialAppointments, vets }: AppointmentsCalendarProps) {
  const [appointments, setAppointments] = useState<AppointmentFull[]>(initialAppointments);
  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState(new Date());
  const [isPending, startTransition] = useTransition();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [presetStart, setPresetStart] = useState<Date | undefined>();

  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentFull | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentFull | null>(null);
  const [zoom, setZoom] = useState<"compact" | "normal" | "large">("compact");

  // Refs keep EventComponent stable so DnD HOC doesn't break on state changes
  const viewRef = useRef(view);
  viewRef.current = view;
  const appointmentsRef = useRef(appointments);
  appointmentsRef.current = appointments;

  // IDs of appointments where same vet has overlapping time
  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < appointments.length; i++) {
      for (let j = i + 1; j < appointments.length; j++) {
        const a = appointments[i], b = appointments[j];
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
  }, [appointments]);
  const conflictIdsRef = useRef(conflictIds);
  conflictIdsRef.current = conflictIds;

  const events = useMemo<CalEvent[]>(() =>
    appointments.map((apt) => ({
      id: apt.id,
      title: apt.title,
      start: new Date(apt.startTime),
      end: new Date(apt.endTime),
      resource: apt,
    })),
    [appointments]
  );

  function navigate(direction: "prev" | "next" | "today") {
    if (direction === "today") { setDate(new Date()); return; }
    const dir = direction === "next" ? 1 : -1;
    setDate((d) => {
      if (view === Views.MONTH) return addMonths(d, dir);
      if (view === Views.WEEK) return addWeeks(d, dir);
      return new Date(d.getTime() + dir * 24 * 60 * 60 * 1000);
    });
  }

  function navLabel() {
    if (view === Views.MONTH) return format(date, "MMMM yyyy", { locale: es });
    if (view === Views.WEEK) {
      const start = startOfWeek(date, { weekStartsOn: 1 });
      const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
      return `${format(start, "d MMM", { locale: es })} — ${format(end, "d MMM yyyy", { locale: es })}`;
    }
    return format(date, "EEEE, d MMMM yyyy", { locale: es });
  }

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    setPresetStart(slotInfo.start as Date);
    setCreateDialogOpen(true);
  }, []);

  const handleSelectEvent = useCallback((event: CalEvent) => {
    setSelectedAppointment(event.resource);
    setDetailOpen(true);
  }, []);

  const handleEventDrop = useCallback(
    ({ event, start, end }: { event: CalEvent; start: Date | string; end: Date | string }) => {
      const startDate = new Date(start);
      const endDate = new Date(end);
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === event.id ? { ...a, startTime: startDate, endTime: endDate } : a
        )
      );
      startTransition(async () => {
        try {
          await updateAppointmentTime(event.id, startDate, endDate);
          toast.success("Cita reprogramada");
        } catch {
          setAppointments((prev) =>
            prev.map((a) =>
              a.id === event.id
                ? { ...a, startTime: event.resource.startTime, endTime: event.resource.endTime }
                : a
            )
          );
          toast.error("Error al reprogramar");
        }
      });
    },
    []
  );

  const handleEventResize = useCallback(
    ({ event, start, end }: { event: CalEvent; start: Date | string; end: Date | string }) => {
      handleEventDrop({ event, start, end });
    },
    [handleEventDrop]
  );

  function handleAppointmentSaved(appointment: AppointmentFull) {
    setAppointments((prev) => {
      const exists = prev.find((a) => a.id === appointment.id);
      if (exists) return prev.map((a) => (a.id === appointment.id ? appointment : a));
      return [appointment, ...prev];
    });
  }

  function handleAppointmentUpdated(appointment: AppointmentFull) {
    setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? appointment : a)));
    setSelectedAppointment(appointment);
  }

  function handleAppointmentDeleted(id: string) {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    setDetailOpen(false);
  }

  function handleEditFromDetail() {
    if (!selectedAppointment) return;
    setEditingAppointment(selectedAppointment);
    setDetailOpen(false);
    setEditDialogOpen(true);
  }

  const eventPropGetter = useCallback(
    (event: CalEvent) => {
      const style = getEventStyle(event.resource.type, event.resource.status);
      if (conflictIds.has(event.id)) {
        return {
          style: {
            ...style,
            borderLeftColor: "#EF4444",
            borderColor: "#FCA5A5",
            boxShadow: "2px 2px 0 #FCA5A5, 4px 4px 0 #FCA5A580",
          },
        };
      }
      return { style };
    },
    [conflictIds]
  );

  // Memoized per-view to avoid remounting events on unrelated state changes
  const EventComponent = useMemo(
    () =>
      function Evt({ event }: { event: CalEvent }) {
        const apt = event.resource;
        const durationMin = Math.round(
          (event.end.getTime() - event.start.getTime()) / 60000
        );
        const isMonthView = viewRef.current === Views.MONTH;

        // All appointments overlapping with this event (including itself)
        const overlapping = appointmentsRef.current.filter(
          (a) => new Date(a.startTime) < event.end && new Date(a.endTime) > event.start
        );
        const others = overlapping.filter((a) => a.id !== apt.id);
        const hasConflict = conflictIdsRef.current.has(apt.id);

        return (
          <TooltipPrimitive.Root delayDuration={300}>
            <TooltipPrimitive.Trigger asChild>
              <div className="h-full w-full overflow-hidden">
                {isMonthView ? (
                  <div className="flex items-center gap-1 overflow-hidden">
                    {hasConflict && <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-red-500" />}
                    <span className="truncate font-semibold text-xs leading-none">{apt.pet.name}</span>
                  </div>
                ) : (
                  <div className="h-full flex flex-col justify-start gap-px overflow-hidden">
                    <div className="flex items-center gap-1 overflow-hidden">
                      {hasConflict && <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-red-500 flex-none" />}
                      <span className="font-semibold text-[11px] leading-tight truncate">
                        {apt.pet.name}
                      </span>
                    </div>
                    <span className="text-[10px] leading-tight truncate opacity-80">
                      {apt.veterinarian.name}
                    </span>
                    {durationMin >= 45 && apt.notes && (
                      <span className="text-[9px] leading-tight truncate opacity-60 italic">
                        {apt.notes}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </TooltipPrimitive.Trigger>

            <TooltipPrimitive.Portal>
              <TooltipPrimitive.Content
                side="right"
                sideOffset={8}
                avoidCollisions
                collisionPadding={12}
                className={cn(
                  "z-[9999] rounded-xl border bg-popover shadow-xl overflow-hidden",
                  hasConflict ? "border-red-300" : "border-border",
                  others.length > 0 ? "w-72" : "w-64",
                  "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
                  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                )}
              >
                {/* Conflict warning banner */}
                {hasConflict && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                      Conflicto: {apt.veterinarian.name} tiene otra cita a esta hora
                    </p>
                  </div>
                )}

                {/* Group header when multiple appointments overlap */}
                {others.length > 0 && !hasConflict && (
                  <div className="px-3 pt-2.5 pb-1.5 border-b border-border">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {overlapping.length} citas simultáneas
                    </p>
                  </div>
                )}
                {others.length > 0 && hasConflict && (
                  <div className="px-3 pt-2 pb-1.5 border-b border-border">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {overlapping.length} citas simultáneas
                    </p>
                  </div>
                )}

                {/* Current appointment (highlighted) */}
                <AppointmentCard apt={apt} startTime={event.start} endTime={event.end} highlight />

                {/* Other overlapping appointments */}
                {others.map((oa) => (
                  <AppointmentCard
                    key={oa.id}
                    apt={oa}
                    startTime={new Date(oa.startTime)}
                    endTime={new Date(oa.endTime)}
                    conflict={conflictIdsRef.current.has(oa.id)}
                  />
                ))}

                <TooltipPrimitive.Arrow
                  className={hasConflict ? "fill-red-300" : "fill-border"}
                  width={10}
                  height={5}
                />
              </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
          </TooltipPrimitive.Root>
        );
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <TooltipPrimitive.Provider delayDuration={500}>
      <div className="flex flex-col h-full gap-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate("prev")}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("today")}>
              Hoy
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigate("next")}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium ml-2 capitalize">{navLabel()}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom control */}
            <div className="flex rounded-lg border border-border overflow-hidden" title="Zoom">
              {(["compact", "normal", "large"] as const).map((z) => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  className={cn(
                    "w-8 py-1.5 text-sm transition-colors",
                    zoom === z
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {z === "compact" ? "−" : z === "normal" ? "○" : "+"}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {[Views.MONTH, Views.WEEK, Views.DAY].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1.5 text-sm transition-colors",
                    view === v
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
            <Button
              className="bg-primary text-primary-foreground"
              onClick={() => { setPresetStart(undefined); setCreateDialogOpen(true); }}
            >
              + Nueva cita
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {Object.entries(typeConfig).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cfg.border }} />
              {cfg.label}
            </span>
          ))}
        </div>

        {/* Calendar */}
        <div
          className={cn(
            "rounded-xl border border-border overflow-hidden bg-card",
            "[&_.rbc-calendar]:h-full",
            "[&_.rbc-header]:text-xs [&_.rbc-header]:font-medium [&_.rbc-header]:text-muted-foreground [&_.rbc-header]:border-border",
            "[&_.rbc-month-view]:border-none [&_.rbc-month-view]:flex-1",
            "[&_.rbc-month-row]:border-border [&_.rbc-month-row]:min-h-[100px]",
            "[&_.rbc-day-bg]:border-border [&_.rbc-day-bg.rbc-today]:bg-primary/5",
            "[&_.rbc-time-view]:border-none",
            "[&_.rbc-time-header]:border-border",
            "[&_.rbc-time-content]:border-border",
            "[&_.rbc-timeslot-group]:border-border",
            "[&_.rbc-time-slot]:text-xs [&_.rbc-time-slot]:text-muted-foreground",
            "[&_.rbc-current-time-indicator]:bg-primary",
            "[&_.rbc-off-range-bg]:bg-muted/30",
            "[&_.rbc-show-more]:text-primary [&_.rbc-show-more]:text-xs",
            "[&_.rbc-toolbar]:hidden",
            "[&_.rbc-event]:ring-0 [&_.rbc-event]:outline-none [&_.rbc-time-view_.rbc-event-label]:hidden",
            "[&_.rbc-selected]:ring-2 [&_.rbc-selected]:ring-primary",
            zoom === "compact" && "[&_.rbc-timeslot-group]:min-h-[28px]",
            zoom === "normal"  && "[&_.rbc-timeslot-group]:min-h-[48px]",
            zoom === "large"   && "[&_.rbc-timeslot-group]:min-h-[72px]",
            isPending && "opacity-70 pointer-events-none"
          )}
          style={{ height: "calc(100vh - 260px)", minHeight: 400 }}
        >
          <DnDCalendar
            localizer={localizer}
            events={events}
            view={view}
            date={date}
            onNavigate={setDate}
            onView={setView}
            selectable
            resizable
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent as (event: object) => void}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onEventDrop={handleEventDrop as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onEventResize={handleEventResize as any}
            eventPropGetter={eventPropGetter as (event: object) => { style: React.CSSProperties }}
            components={{ event: EventComponent as (props: { event: object }) => JSX.Element }}
            culture="es"
            messages={{
              noEventsInRange: "No hay citas en este período",
              showMore: (total: number) => `+${total} más`,
              allDay: "Todo el día",
            }}
            step={15}
            timeslots={2}
            min={new Date(0, 0, 0, 7, 0)}
            max={new Date(0, 0, 0, 21, 0)}
            popup
            scrollToTime={new Date(0, 0, 0, 8, 0)}
          />
        </div>

        {/* Create Dialog */}
        <AppointmentDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          vets={vets}
          presetStart={presetStart}
          onSaved={handleAppointmentSaved}
        />

        {/* Edit Dialog */}
        {editingAppointment && (
          <AppointmentDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            vets={vets}
            appointment={editingAppointment}
            onSaved={handleAppointmentSaved}
          />
        )}

        {/* Detail Sheet */}
        {selectedAppointment && (
          <AppointmentDetailSheet
            open={detailOpen}
            onOpenChange={setDetailOpen}
            appointment={selectedAppointment}
            onUpdated={handleAppointmentUpdated}
            onDeleted={handleAppointmentDeleted}
            onEdit={handleEditFromDetail}
          />
        )}
      </div>
    </TooltipPrimitive.Provider>
  );
}
