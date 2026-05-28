"use client";

import { useState, useCallback, useMemo, useTransition } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay, addWeeks, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { updateShift } from "@/lib/actions/shifts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const locales = { es };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const DnDCalendar = withDragAndDrop(Calendar);

// 8-color palette cycling by staff index
const PALETTE = [
  "#1D9E75", "#2563eb", "#d97706", "#7c3aed",
  "#db2777", "#059669", "#dc2626", "#0891b2",
];

type StaffShift = {
  id: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  note: string | null;
  user: { id: string; name: string; role: string };
};

type CalEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: StaffShift;
  color: string;
};

interface TeamScheduleCalendarProps {
  initialShifts: StaffShift[];
  staffMembers: Array<{ id: string; name: string; role: string }>;
}

export function TeamScheduleCalendar({ initialShifts, staffMembers }: TeamScheduleCalendarProps) {
  const [shifts, setShifts] = useState<StaffShift[]>(initialShifts);
  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState(new Date());
  const [filterUserId, setFilterUserId] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    staffMembers.forEach((s, i) => { map[s.id] = PALETTE[i % PALETTE.length]; });
    return map;
  }, [staffMembers]);

  const filteredShifts = useMemo(
    () => filterUserId === "ALL" ? shifts : shifts.filter((s) => s.userId === filterUserId),
    [shifts, filterUserId]
  );

  const events = useMemo<CalEvent[]>(
    () =>
      filteredShifts.map((s) => ({
        id: s.id,
        title: `${s.user.name}${s.note ? ` — ${s.note}` : ""}`,
        start: new Date(s.startTime),
        end: new Date(s.endTime),
        resource: s,
        color: colorMap[s.userId] ?? PALETTE[0],
      })),
    [filteredShifts, colorMap]
  );

  const eventStyleGetter = useCallback(
    (event: CalEvent) => ({
      style: {
        backgroundColor: event.color,
        borderColor: event.color,
        color: "#fff",
        borderRadius: "6px",
      },
    }),
    []
  );

  const handleEventDrop = useCallback(({ event, start, end }: { event: CalEvent; start: Date; end: Date }) => {
    startTransition(async () => {
      setShifts((prev) =>
        prev.map((s) => s.id === event.id ? { ...s, startTime: start, endTime: end } : s)
      );
      await updateShift(event.id, { startTime: start.toISOString(), endTime: end.toISOString() });
      toast.success("Turno actualizado");
    });
  }, []);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setDate((d) => subWeeks(d, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDate(new Date())}>Hoy</Button>
        <Button variant="outline" size="icon" onClick={() => setDate((d) => addWeeks(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{format(date, "MMMM yyyy", { locale: es })}</span>
        <div className="ml-auto flex items-center gap-2">
          <Select value={filterUserId} onValueChange={(v) => setFilterUserId(v ?? "ALL")}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {staffMembers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorMap[s.id] }} />
                    {s.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(["week", "day"] as View[]).map((v) => (
            <Button key={v} variant={view === v ? "default" : "outline"} size="sm" onClick={() => setView(v)}>
              {v === "week" ? "Semana" : "Día"}
            </Button>
          ))}
        </div>
      </div>

      {/* Color legend */}
      <div className="flex flex-wrap gap-3">
        {staffMembers.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 text-xs">
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: colorMap[s.id] }} />
            <span className="text-muted-foreground">{s.name}</span>
          </div>
        ))}
      </div>

      <div
        className={cn(
          "rounded-xl border border-border overflow-hidden bg-card",
          "[&_.rbc-toolbar]:hidden",
          "[&_.rbc-time-view]:border-none",
          "[&_.rbc-header]:border-border [&_.rbc-header]:text-xs [&_.rbc-header]:font-medium",
          "[&_.rbc-time-slot]:border-border [&_.rbc-timeslot-group]:border-border",
          "[&_.rbc-today]:bg-primary/5",
        )}
        style={{ height: 560 }}
      >
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={view}
          date={date}
          onView={setView}
          onNavigate={setDate}
          eventPropGetter={eventStyleGetter as never}
          onEventDrop={handleEventDrop as never}
          culture="es"
        />
      </div>
    </div>
  );
}
