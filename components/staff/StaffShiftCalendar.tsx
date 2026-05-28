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
import { format, parse, startOfWeek, getDay, addWeeks, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { createShift, updateShift, deleteShift } from "@/lib/actions/shifts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
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

type Shift = { id: string; userId: string; startTime: Date; endTime: Date; note: string | null };

type CalEvent = { id: string; title: string; start: Date; end: Date; resource: Shift };

interface StaffShiftCalendarProps {
  userId: string;
  initialShifts: Shift[];
}

export function StaffShiftCalendar({ userId, initialShifts }: StaffShiftCalendarProps) {
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);
  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState(new Date());
  const [isPending, startTransition] = useTransition();
  const [createDialog, setCreateDialog] = useState<{ start: Date; end: Date } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<Shift | null>(null);
  const [newNote, setNewNote] = useState("");

  const events = useMemo<CalEvent[]>(
    () => shifts.map((s) => ({ id: s.id, title: s.note ?? "Turno", start: new Date(s.startTime), end: new Date(s.endTime), resource: s })),
    [shifts]
  );

  const handleSelectSlot = useCallback((slot: SlotInfo) => {
    setNewNote("");
    setCreateDialog({ start: slot.start, end: slot.end });
  }, []);

  const handleEventDrop = useCallback(({ event, start, end }: { event: CalEvent; start: Date; end: Date }) => {
    startTransition(async () => {
      setShifts((prev) => prev.map((s) => s.id === event.id ? { ...s, startTime: start, endTime: end } : s));
      await updateShift(event.id, {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      toast.success("Turno actualizado");
    });
  }, []);

  function handleCreateShift(e: React.FormEvent) {
    e.preventDefault();
    if (!createDialog) return;
    startTransition(async () => {
      const result = await createShift({
        userId,
        startTime: createDialog.start.toISOString(),
        endTime: createDialog.end.toISOString(),
        note: newNote,
      });
      if (result?.error) { toast.error("Error al crear turno"); return; }
      toast.success("Turno creado");
      setCreateDialog(null);
      router.refresh();
    });
  }

  function handleDeleteShift() {
    if (!deleteDialog) return;
    startTransition(async () => {
      await deleteShift(deleteDialog.id);
      setShifts((prev) => prev.filter((s) => s.id !== deleteDialog.id));
      toast.success("Turno eliminado");
      setDeleteDialog(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setDate((d) => subWeeks(d, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDate(new Date())}>Hoy</Button>
        <Button variant="outline" size="icon" onClick={() => setDate((d) => addWeeks(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium ml-2">{format(date, "MMMM yyyy", { locale: es })}</span>
        <div className="ml-auto flex gap-1">
          {(["week", "day"] as View[]).map((v) => (
            <Button key={v} variant={view === v ? "default" : "outline"} size="sm" onClick={() => setView(v)}>
              {v === "week" ? "Semana" : "Día"}
            </Button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "rounded-xl border border-border overflow-hidden bg-card",
          "[&_.rbc-toolbar]:hidden",
          "[&_.rbc-time-view]:border-none",
          "[&_.rbc-header]:border-border [&_.rbc-header]:text-xs [&_.rbc-header]:font-medium [&_.rbc-header]:py-2",
          "[&_.rbc-time-slot]:border-border [&_.rbc-timeslot-group]:border-border",
          "[&_.rbc-day-bg]:bg-transparent",
          "[&_.rbc-event]:!bg-emerald-500 [&_.rbc-event]:!border-emerald-600 [&_.rbc-event]:text-white [&_.rbc-event]:rounded-md",
          "[&_.rbc-today]:bg-primary/5",
        )}
        style={{ height: 520 }}
      >
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={view}
          date={date}
          onView={setView}
          onNavigate={setDate}
          selectable
          onSelectSlot={handleSelectSlot}
          onEventDrop={handleEventDrop as never}
          onSelectEvent={(event) => setDeleteDialog((event as CalEvent).resource)}
          culture="es"
        />
      </div>

      {/* Create shift dialog */}
      <Dialog open={!!createDialog} onOpenChange={(v) => !v && setCreateDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Añadir turno</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateShift} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {createDialog && `${format(createDialog.start, "dd/MM/yyyy HH:mm")} – ${format(createDialog.end, "HH:mm")}`}
            </p>
            <div className="space-y-1">
              <Label>Nota</Label>
              <Input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setCreateDialog(null)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "..." : "Crear"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete shift dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(v) => !v && setDeleteDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Eliminar turno</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteDialog && `${format(new Date(deleteDialog.startTime), "dd/MM/yyyy HH:mm")} – ${format(new Date(deleteDialog.endTime), "HH:mm")}`}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={isPending} onClick={handleDeleteShift}>
              <Trash2 className="h-4 w-4 mr-2" />Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
