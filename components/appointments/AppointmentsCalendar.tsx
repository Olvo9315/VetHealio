"use client";

import { useState, useCallback, useMemo, useTransition } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
  type SlotInfo,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay, addMonths, addWeeks } from "date-fns";
import { es } from "date-fns/locale";
import type { AppointmentFull } from "@/lib/actions/appointments";
import { updateAppointmentTime } from "@/lib/actions/appointments";
import { getEventStyle, typeConfig } from "./AppointmentConfig";
import { AppointmentDialog } from "./AppointmentDialog";
import { AppointmentDetailSheet } from "./AppointmentDetailSheet";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Setup localizer with date-fns
const locales = { es };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

// DnD-enhanced calendar
const DnDCalendar = withDragAndDrop(Calendar);

// Calendar event type
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

export function AppointmentsCalendar({ initialAppointments, vets }: AppointmentsCalendarProps) {
  const [appointments, setAppointments] = useState<AppointmentFull[]>(initialAppointments);
  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState(new Date());
  const [isPending, startTransition] = useTransition();

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [presetStart, setPresetStart] = useState<Date | undefined>();

  // Detail sheet state
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentFull | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentFull | null>(null);

  // Convert appointments to calendar events
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

  // Navigate calendar
  function navigate(direction: "prev" | "next" | "today") {
    if (direction === "today") { setDate(new Date()); return; }
    const dir = direction === "next" ? 1 : -1;
    setDate((d) => {
      if (view === Views.MONTH) return addMonths(d, dir);
      if (view === Views.WEEK) return addWeeks(d, dir);
      return new Date(d.getTime() + dir * 24 * 60 * 60 * 1000);
    });
  }

  // Format nav label
  function navLabel() {
    if (view === Views.MONTH) return format(date, "MMMM yyyy", { locale: es });
    if (view === Views.WEEK) {
      const start = startOfWeek(date, { weekStartsOn: 1 });
      const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
      return `${format(start, "d MMM", { locale: es })} — ${format(end, "d MMM yyyy", { locale: es })}`;
    }
    return format(date, "EEEE, d MMMM yyyy", { locale: es });
  }

  // Click on empty slot → open create dialog
  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    setPresetStart(slotInfo.start as Date);
    setCreateDialogOpen(true);
  }, []);

  // Click on event → open detail sheet
  const handleSelectEvent = useCallback((event: CalEvent) => {
    setSelectedAppointment(event.resource);
    setDetailOpen(true);
  }, []);

  // Drag-and-drop → update time
  const handleEventDrop = useCallback(
    ({ event, start, end }: { event: CalEvent; start: Date | string; end: Date | string }) => {
      const startDate = new Date(start);
      const endDate = new Date(end);

      // Optimistic update
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
          // Revert
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

  // Drag resize
  const handleEventResize = useCallback(
    ({ event, start, end }: { event: CalEvent; start: Date | string; end: Date | string }) => {
      handleEventDrop({ event, start, end });
    },
    [handleEventDrop]
  );

  // Appointment saved (create or edit)
  function handleAppointmentSaved(appointment: AppointmentFull) {
    setAppointments((prev) => {
      const exists = prev.find((a) => a.id === appointment.id);
      if (exists) return prev.map((a) => (a.id === appointment.id ? appointment : a));
      return [appointment, ...prev];
    });
  }

  // Appointment updated from detail sheet (status change, etc.)
  function handleAppointmentUpdated(appointment: AppointmentFull) {
    setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? appointment : a)));
    setSelectedAppointment(appointment);
  }

  // Appointment deleted from detail sheet
  function handleAppointmentDeleted(id: string) {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    setDetailOpen(false);
  }

  // Open edit dialog from detail sheet
  function handleEditFromDetail() {
    if (!selectedAppointment) return;
    setEditingAppointment(selectedAppointment);
    setDetailOpen(false);
    setEditDialogOpen(true);
  }

  // Custom event renderer
  const eventPropGetter = useCallback(
    (event: CalEvent) => ({
      style: getEventStyle(event.resource.type, event.resource.status),
    }),
    []
  );

  // Custom event component
  function EventComponent({ event }: { event: CalEvent }) {
    const apt = event.resource;
    return (
      <div className="truncate leading-tight">
        <span className="font-semibold">{apt.pet.name}</span>
        {view !== Views.MONTH && (
          <span className="opacity-70 ml-1 text-[10px]">· {apt.veterinarian.name}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Navigation */}
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
          {/* View switcher */}
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

          {/* New appointment button */}
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
          "flex-1 min-h-0 rounded-xl border border-border overflow-hidden bg-card",
          "[&_.rbc-calendar]:h-full",
          "[&_.rbc-header]:text-xs [&_.rbc-header]:font-medium [&_.rbc-header]:text-muted-foreground [&_.rbc-header]:border-border",
          "[&_.rbc-month-view]:border-none [&_.rbc-month-row]:border-border",
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
          "[&_.rbc-event]:ring-0 [&_.rbc-event]:outline-none [&_.rbc-event-label]:text-[10px]",
          "[&_.rbc-selected]:ring-2 [&_.rbc-selected]:ring-primary",
          isPending && "opacity-70 pointer-events-none"
        )}
        style={{ height: "calc(100vh - 280px)", minHeight: 400 }}
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
          timeslots={4}
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
  );
}
