"use client";

import { useState, useCallback, useMemo, useTransition, useRef, useEffect } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type View,
  type SlotInfo,
  type DateHeaderProps,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { format, parse, startOfWeek, getDay, addMonths, addWeeks, addDays, startOfDay } from "date-fns";
import { useDateLocale } from "@/lib/date-locale";
import { calendarLocales, useCalendarI18n } from "@/lib/calendar-i18n";
import type { AppointmentFull, CalendarLeave } from "@/lib/actions/appointments";
import { updateAppointmentTime } from "@/lib/actions/appointments";
import { getEventStyleForAppointment, getTypeCfgForAppointment, typeConfig, statusConfig, cfgLabel } from "./AppointmentConfig";
import { useTranslations } from "next-intl";
import type { ServiceFlat } from "@/lib/actions/services";
import type { AppointmentOption } from "@/lib/actions/invoices";
import { AppointmentDialog } from "./AppointmentDialog";
import { AppointmentDetailSheet } from "./AppointmentDetailSheet";
import { InvoiceDialog } from "@/components/finances/InvoiceDialog";
import { PrescriptionDialog } from "@/components/patients/PrescriptionDialog";
import { VisitMedicalRecordDialog } from "@/components/medical-records/VisitMedicalRecordDialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, User, Stethoscope, AlertTriangle, DoorOpen, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Room } from "@/lib/actions/rooms";
import { PetQuickInfo } from "@/components/patients/PetQuickInfo";
import { PetQuickSheet, type PetPreview } from "@/components/patients/PetQuickSheet";
import { servicePath } from "@/lib/service-path";

const locales = calendarLocales;
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
  // Column in the per-room day view ("none" = appointments without a room)
  resourceId: string;
};

// Approved staff absence drawn as an all-day bar (month and week views)
type LeaveEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: true;
  leave: CalendarLeave;
};
type CalItem = CalEvent | LeaveEvent;
const isLeave = (e: object): e is LeaveEvent => "leave" in e;
const LEAVE_STYLE = {
  vacation: { backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #F59E0B" },
  absent: { backgroundColor: "#F3F4F6", color: "#374151", border: "1px solid #9CA3AF" },
};
// Per-vet dots in the month summary
const VET_COLORS = ["#1D9E75", "#2563EB", "#9333EA", "#DB2777", "#EA580C", "#0891B2", "#65A30D", "#B91C1C"];

type Zoom = "compact" | "normal" | "large";
// Calendar hours shown in week/day views
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 21;
// Touch: how long a finger must rest on an appointment before it can be moved or resized
const ARM_HOLD_MS = 450;

type RoomColumn = { id: string; name: string; color: string };
const NO_ROOM = "none";
// Day view shows at most this many room columns per screen; more scroll horizontally
const ROOMS_PER_SCREEN = 3;
const FILTER_STORAGE_KEY = "vh.calendar.filters";

type Vet = { id: string; name: string; role: string };

interface AppointmentsCalendarProps {
  initialAppointments: AppointmentFull[];
  vets: Vet[];
  services: ServiceFlat[];
  rooms: Room[];
  leaves?: CalendarLeave[];
  // Phone layout (week/month inside the mobile schedule): compact toolbar, no view switcher
  // or legend; tapping a day hands it back to the mobile day list via onOpenDay
  mobile?: boolean;
  initialView?: View;
  onOpenDay?: (day: Date) => void;
  onAppointmentsChange?: (appointments: AppointmentFull[]) => void;
}


function AppointmentCard({
  apt,
  startTime,
  endTime,
  highlight = false,
  conflict = false,
  roomConflict = false,
  onPetClick,
  serviceLabel = (_id, fallback) => fallback,
}: {
  apt: AppointmentFull;
  startTime: Date;
  endTime: Date;
  highlight?: boolean;
  conflict?: boolean;
  roomConflict?: boolean;
  onPetClick?: (pet: PetPreview) => void;
  serviceLabel?: (id: string, fallback: string) => string;
}) {
  const t = useTranslations("appointments");
  const tp = useTranslations("petInfo");
  const typeCfg = getTypeCfgForAppointment(apt);
  const statusCfg = statusConfig[apt.status];
  // Hovering the pet name opens the pet summary as its own popup beside the appointment tooltip
  const [petPopup, setPetPopup] = useState<{ top: number; side: "left" | "right" } | null>(null);
  function openPetPopup(e: React.MouseEvent<HTMLElement>) {
    const box = e.currentTarget.closest<HTMLElement>("[data-apt-tooltip]");
    if (!box) return;
    const boxRect = box.getBoundingClientRect();
    const nameRect = e.currentTarget.getBoundingClientRect();
    const side = boxRect.right + 8 + 272 > window.innerWidth ? "left" : "right";
    setPetPopup({ top: nameRect.top - boxRect.top - 12, side });
  }
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
            className="font-semibold text-sm leading-tight cursor-pointer underline decoration-dotted underline-offset-2 w-fit"
            style={{ color: typeCfg.color }}
            title={petPopup ? undefined : tp("hoverHint")}
            onMouseEnter={openPetPopup}
            onMouseLeave={() => setPetPopup(null)}
            // The tooltip is portalled, but React events still bubble to the calendar event:
            // stop them so the click doesn't also open the appointment or start a drag
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setPetPopup(null);
              onPetClick?.({ id: apt.petId, name: apt.pet.name });
            }}
          >
            {apt.pet.name}
          </p>
          <p className="text-xs opacity-70 leading-tight" style={{ color: typeCfg.color }}>
            {apt.title}
          </p>
          {apt.presvetPending && (
            <p className="text-[11px] leading-tight text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-0.5">
              <ShieldAlert className="w-3 h-3" />
              {t("presvetPending")}
            </p>
          )}
          {!!apt.extraServices?.length && (
            <p className="text-[11px] leading-tight text-muted-foreground mt-0.5">
              + {apt.extraServices.map((s) => serviceLabel(s.id, s.name)).join(", ")}
            </p>
          )}
        </div>
        <span
          className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: typeCfg.bg, color: typeCfg.color, border: `1px solid ${typeCfg.border}` }}
        >
          {cfgLabel(t, typeCfg)}
        </span>
      </div>

      {petPopup && (
        <div
          className={cn(
            "absolute z-10 w-64 rounded-xl border border-border bg-popover shadow-xl p-3 pointer-events-none vh-pop-in",
            petPopup.side === "right" ? "left-full ml-2" : "right-full mr-2"
          )}
          style={{ top: Math.max(0, petPopup.top) }}
        >
          <p className="text-sm font-semibold mb-1.5" style={{ color: typeCfg.color }}>{apt.pet.name}</p>
          <PetQuickInfo petId={apt.petId} />
        </div>
      )}

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

      {/* Room */}
      {apt.room && (
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: apt.room.color }}>
          <DoorOpen className="w-3 h-3 shrink-0" />
          <span>{apt.room.name}</span>
          {roomConflict && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
        </div>
      )}

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
        {t(statusCfg.label)}
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

export function AppointmentsCalendar({
  initialAppointments,
  vets,
  services,
  rooms,
  leaves = [],
  mobile = false,
  initialView,
  onOpenDay,
  onAppointmentsChange,
}: AppointmentsCalendarProps) {
  const dateLocale = useDateLocale();
  const calendarI18n = useCalendarI18n();
  const t = useTranslations("appointments");
  const tRef = useRef(t);
  tRef.current = t;
  const [appointments, setAppointments] = useState<AppointmentFull[]>(initialAppointments);
  const onAppointmentsChangeRef = useRef(onAppointmentsChange);
  onAppointmentsChangeRef.current = onAppointmentsChange;
  useEffect(() => {
    onAppointmentsChangeRef.current?.(appointments);
  }, [appointments]);
  const [view, setView] = useState<View>(initialView ?? Views.WEEK);
  const mobileRef = useRef(mobile);
  mobileRef.current = mobile;
  // Opening a single day: the mobile list handles it on phones, the day view otherwise
  const openDayRef = useRef<(day: Date) => void>(() => {});
  openDayRef.current = (day: Date) => {
    if (onOpenDay) onOpenDay(day);
    else {
      setDate(day);
      setView(Views.DAY);
    }
  };
  const [date, setDate] = useState(new Date());
  const [isPending, startTransition] = useTransition();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [presetStart, setPresetStart] = useState<Date | undefined>();
  const [presetRoomId, setPresetRoomId] = useState<string | undefined>();
  const tr = useTranslations("rooms");
  const trRef = useRef(tr);
  trRef.current = tr;

  // Filters: one vet (or all) and a set of rooms; remembered per browser
  const [vetFilter, setVetFilter] = useState<string>("ALL");
  const [roomFilter, setRoomFilter] = useState<string[]>(() => rooms.map((r) => r.id));
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) ?? "{}");
      if (typeof saved.vet === "string" && (saved.vet === "ALL" || vets.some((v) => v.id === saved.vet))) setVetFilter(saved.vet);
      if (Array.isArray(saved.rooms)) {
        const known = saved.rooms.filter((id: string) => rooms.some((r) => r.id === id));
        if (known.length) setRoomFilter(known);
      }
    } catch {
      // storage unavailable: keep defaults
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ vet: vetFilter, rooms: roomFilter }));
    } catch {
      // ignore
    }
  }, [vetFilter, roomFilter]);
  const allRoomsSelected = roomFilter.length === rooms.length;
  function toggleRoom(id: string) {
    setRoomFilter((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentFull | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentFull | null>(null);
  // Phones start fully zoomed out so the whole working day fits on one screen
  const [zoom, setZoom] = useState<Zoom>(mobile ? "compact" : "normal");
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const calendarBoxRef = useRef<HTMLDivElement>(null);
  // Pinch-zooming with two fingers must not count as a tap on a slot or an appointment.
  // Set as soon as a second finger touches down, cleared when a new gesture starts with one.
  const multiTouchRef = useRef(false);
  // Touch screens: an appointment can be moved or resized only after holding a finger on it
  // ("armed": highlighted, with a handle at the bottom), never from a passing touch
  const [touchUi, setTouchUi] = useState(false);
  const touchUiRef = useRef(touchUi);
  touchUiRef.current = touchUi;
  const [armedId, setArmedId] = useState<string | null>(null);
  const armedRef = useRef(armedId);
  armedRef.current = armedId;
  const justArmedAtRef = useRef(0);
  // Live position while the armed appointment is being moved or resized with a finger
  // Resizing changes the appointment in place; moving draws a ghost over the grid instead, because
  // re-rendering the appointment in another column would drop the finger's touch events
  const [touchPreview, setTouchPreview] = useState<{
    id: string;
    mode: "move" | "resize";
    start: Date;
    end: Date;
    resourceId?: string;
    ghost?: { left: number; top: number; width: number; height: number };
  } | null>(null);
  const handleEventDropRef = useRef<
    (args: { event: CalEvent; start: Date; end: Date; resourceId?: string }) => void
  >(() => {});
  useEffect(() => {
    setTouchUi(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  useEffect(() => {
    const box = calendarBoxRef.current;
    if (!box) return;
    let armTimer: ReturnType<typeof setTimeout> | undefined;
    let startX = 0;
    let startY = 0;
    // The finger that armed an appointment (or touched an armed one) moves it; the bottom bar resizes it
    type Gesture = {
      mode: "move" | "resize";
      apt: AppointmentFull;
      startX: number;
      startY: number;
      pxPerMin: number;
      columns: Element[];
      fromColumn: number;
      start: Date;
      end: Date;
      resourceId?: string;
      toColumn: number;
      moved: boolean;
    };
    let gesture: Gesture | null = null;
    const cancelArm = () => {
      if (armTimer) clearTimeout(armTimer);
      armTimer = undefined;
    };

    const beginGesture = (mode: Gesture["mode"], aptId: string, target: Element, x: number, y: number) => {
      const apt = appointmentsRef.current.find((a) => a.id === aptId);
      const daySlot = target.closest(".rbc-day-slot");
      if (!apt || !daySlot) return;
      const columns = Array.from(box.querySelectorAll(".rbc-time-content .rbc-day-slot"));
      gesture = {
        mode,
        apt,
        startX: x,
        startY: y,
        pxPerMin: daySlot.getBoundingClientRect().height / ((DAY_END_HOUR - DAY_START_HOUR) * 60),
        columns,
        fromColumn: columns.indexOf(daySlot),
        toColumn: columns.indexOf(daySlot),
        start: new Date(apt.startTime),
        end: new Date(apt.endTime),
        moved: false,
      };
    };

    const onStart = (e: TouchEvent) => {
      cancelArm();
      if (e.touches.length > 1) {
        multiTouchRef.current = true;
        gesture = null;
        setTouchPreview(null);
        return;
      }
      multiTouchRef.current = false;
      const touch = e.touches[0];
      const target = e.target as Element;
      const armed = armedRef.current;
      const id = target.closest<HTMLElement>("[data-apt-id]")?.dataset.aptId;
      if (armed && id === armed) {
        beginGesture(target.closest("[data-resize-handle]") ? "resize" : "move", armed, target, touch.clientX, touch.clientY);
        // Keep the calendar's own selection logic out of this gesture
        e.stopPropagation();
        return;
      }
      if (!id) return;
      startX = touch.clientX;
      startY = touch.clientY;
      armTimer = setTimeout(() => {
        armTimer = undefined;
        if (multiTouchRef.current) return;
        justArmedAtRef.current = Date.now();
        setArmedId(id);
        navigator.vibrate?.(30);
        // Still holding: moving the finger now moves the appointment right away
        beginGesture("move", id, target, startX, startY);
      }, ARM_HOLD_MS);
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        multiTouchRef.current = true;
        cancelArm();
        return;
      }
      const touch = e.touches[0];
      if (gesture) {
        e.preventDefault();
        e.stopPropagation();
        const g = gesture;
        const deltaMin = Math.round((touch.clientY - g.startY) / g.pxPerMin / 15) * 15;
        const origStart = new Date(g.apt.startTime);
        const origEnd = new Date(g.apt.endTime);
        let start = origStart;
        let end: Date;
        let resourceId: string | undefined;
        if (g.mode === "resize") {
          const minutes = Math.max(15, (origEnd.getTime() - origStart.getTime()) / 60000 + deltaMin);
          const dayEnd = new Date(origStart);
          dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);
          end = new Date(Math.min(origStart.getTime() + minutes * 60000, dayEnd.getTime()));
        } else {
          // Column under the finger: another day in the week view, another room in the per-room day view
          const column = g.columns.findIndex((c) => {
            const r = c.getBoundingClientRect();
            return touch.clientX >= r.left && touch.clientX < r.right;
          });
          const toColumn = column === -1 ? g.fromColumn : column;
          const rooms = roomColumnsRef.current;
          const dayShift = rooms ? 0 : toColumn - g.fromColumn;
          if (rooms && g.fromColumn !== -1) resourceId = rooms[toColumn]?.id;
          g.toColumn = toColumn;
          const duration = origEnd.getTime() - origStart.getTime();
          start = new Date(origStart.getTime() + deltaMin * 60000);
          start.setDate(start.getDate() + dayShift);
          // Stay inside the working hours of that day
          const dayStart = new Date(start);
          dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
          const dayEnd = new Date(start);
          dayEnd.setHours(DAY_END_HOUR, 0, 0, 0);
          start = new Date(Math.max(dayStart.getTime(), Math.min(start.getTime(), dayEnd.getTime() - duration)));
          end = new Date(start.getTime() + duration);
        }
        if (start.getTime() !== g.start.getTime() || end.getTime() !== g.end.getTime() || resourceId !== g.resourceId) {
          g.start = start;
          g.end = end;
          g.resourceId = resourceId;
          g.moved = true;
          let ghost: { left: number; top: number; width: number; height: number } | undefined;
          const col = g.columns[g.toColumn];
          if (g.mode === "move" && col) {
            const c = col.getBoundingClientRect();
            const b = box.getBoundingClientRect();
            const fromDayStart = (start.getHours() - DAY_START_HOUR) * 60 + start.getMinutes();
            ghost = {
              left: c.left - b.left,
              top: c.top - b.top + fromDayStart * g.pxPerMin,
              width: c.width,
              height: ((end.getTime() - start.getTime()) / 60000) * g.pxPerMin,
            };
          }
          setTouchPreview({ id: g.apt.id, mode: g.mode, start, end, resourceId, ghost });
        }
        return;
      }
      if (armTimer && Math.hypot(touch.clientX - startX, touch.clientY - startY) > 8) cancelArm();
    };

    const onEnd = (e: TouchEvent) => {
      cancelArm();
      const g = gesture;
      if (!g) return;
      gesture = null;
      setTouchPreview(null);
      // The tap that may follow a hold must not open the appointment
      justArmedAtRef.current = Date.now();
      if (!g.moved) return;
      e.stopPropagation();
      const origStart = new Date(g.apt.startTime);
      const origEnd = new Date(g.apt.endTime);
      const roomChanged = g.resourceId !== undefined && g.resourceId !== (g.apt.roomId ?? NO_ROOM);
      if (g.start.getTime() === origStart.getTime() && g.end.getTime() === origEnd.getTime() && !roomChanged) return;
      handleEventDropRef.current({
        event: { id: g.apt.id, title: g.apt.title, start: origStart, end: origEnd, resource: g.apt, resourceId: g.apt.roomId ?? NO_ROOM },
        start: g.start,
        end: g.end,
        resourceId: roomChanged ? g.resourceId : undefined,
      });
    };

    box.addEventListener("touchstart", onStart, { capture: true, passive: true });
    box.addEventListener("touchmove", onMove, { capture: true, passive: false });
    box.addEventListener("touchend", onEnd, { capture: true, passive: true });
    box.addEventListener("touchcancel", onEnd, { capture: true, passive: true });
    return () => {
      cancelArm();
      box.removeEventListener("touchstart", onStart, { capture: true });
      box.removeEventListener("touchmove", onMove, { capture: true });
      box.removeEventListener("touchend", onEnd, { capture: true });
      box.removeEventListener("touchcancel", onEnd, { capture: true });
    };
  }, []);
  // Click on a pet name in the hover card: pet card panel with "Back" / "Open record"
  const [petPreview, setPetPreview] = useState<PetPreview | null>(null);
  const openPetRef = useRef(setPetPreview);

  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoicePresetApt, setInvoicePresetApt] = useState<AppointmentOption | undefined>();
  const [prescriptionDialogOpen, setPrescriptionDialogOpen] = useState(false);
  const [recordVisitId, setRecordVisitId] = useState<string | null>(null);
  const [prescriptionApt, setPrescriptionApt] = useState<AppointmentFull | null>(null);

  // Refs keep EventComponent stable so DnD HOC doesn't break on state changes
  const viewRef = useRef(view);
  viewRef.current = view;
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  // Full "Category › … › Sub-service" label, since a sub-service name alone ("21 - 30 kg") says little
  const serviceLabelRef = useRef<(id: string) => string | undefined>(() => undefined);
  serviceLabelRef.current = (id: string) =>
    services.some((x) => x.id === id) ? servicePath(services, id, "") : undefined;
  const labelServiceRef = useRef((id: string, fallback: string) => serviceLabelRef.current(id) ?? fallback);
  const roomColumnsRef = useRef<RoomColumn[] | undefined>(undefined);
  const appointmentsRef = useRef(appointments);
  appointmentsRef.current = appointments;

  // Appointments that overlap another one with the same vet / in the same room
  const { conflictIds, roomConflictIds } = useMemo(() => {
    const vetIds = new Set<string>();
    const roomIds = new Set<string>();
    const active = appointments.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW");
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b = active[j];
        const overlap = new Date(a.startTime) < new Date(b.endTime) && new Date(a.endTime) > new Date(b.startTime);
        if (!overlap) continue;
        if (a.veterinarianId === b.veterinarianId) { vetIds.add(a.id); vetIds.add(b.id); }
        if (a.roomId && a.roomId === b.roomId) { roomIds.add(a.id); roomIds.add(b.id); }
      }
    }
    return { conflictIds: new Set(Array.from(vetIds).concat(Array.from(roomIds))), roomConflictIds: roomIds };
  }, [appointments]);
  const roomConflictIdsRef = useRef(roomConflictIds);
  roomConflictIdsRef.current = roomConflictIds;
  const conflictIdsRef = useRef(conflictIds);
  conflictIdsRef.current = conflictIds;

  const visibleAppointments = useMemo(
    () =>
      appointments.filter(
        (a) =>
          (vetFilter === "ALL" || a.veterinarianId === vetFilter) &&
          (rooms.length === 0 || allRoomsSelected || (a.roomId !== null && roomFilter.includes(a.roomId)))
      ),
    [appointments, vetFilter, roomFilter, allRoomsSelected, rooms.length]
  );

  const events = useMemo<CalEvent[]>(() =>
    visibleAppointments.map((apt) => ({
      id: apt.id,
      title: apt.title,
      start: new Date(apt.startTime),
      end: touchPreview?.id === apt.id && touchPreview.mode === "resize" ? touchPreview.end : new Date(apt.endTime),
      resource: apt,
      resourceId: apt.roomId ?? NO_ROOM,
    })),
    [visibleAppointments, touchPreview]
  );

  // Day view with rooms: one column per selected room (+ "no room" when such appointments exist)
  const roomColumns = useMemo<RoomColumn[] | undefined>(() => {
    if (view !== Views.DAY || rooms.length === 0) return undefined;
    const cols: RoomColumn[] = rooms.filter((r) => roomFilter.includes(r.id));
    const dayKey = format(date, "yyyy-MM-dd");
    const unassigned = visibleAppointments.some((a) => !a.roomId && format(new Date(a.startTime), "yyyy-MM-dd") === dayKey);
    if (unassigned) cols.push({ id: NO_ROOM, name: tr("noRoom"), color: "#6B7280" });
    return cols.length ? cols : undefined;
  }, [view, rooms, roomFilter, visibleAppointments, date, tr]);
  roomColumnsRef.current = roomColumns;

  const leaveEvents = useMemo<LeaveEvent[]>(
    () =>
      leaves
        .filter((l) => vetFilter === "ALL" || l.userId === vetFilter)
        .map((l) => ({
          id: `leave-${l.id}`,
          title: l.name,
          start: startOfDay(new Date(l.startDate)),
          // all-day events end exclusively
          end: addDays(startOfDay(new Date(l.endDate)), 1),
          allDay: true as const,
          leave: l,
        })),
    [leaves, vetFilter]
  );

  // Month view draws absences as bars and appointments as a per-day summary;
  // week/day views show absences in the all-day row (not in per-room columns)
  const calendarEvents = useMemo<CalItem[]>(() => {
    if (view === Views.MONTH) return leaveEvents;
    if (roomColumns) return events;
    return [...leaveEvents, ...events];
  }, [view, leaveEvents, events, roomColumns]);

  type DaySummary = { total: number; conflicts: number; byVet: { id: string; name: string; color: string; count: number }[] };
  const monthSummary = useMemo(() => {
    const map = new Map<string, DaySummary>();
    for (const a of visibleAppointments) {
      if (a.status === "CANCELLED" || a.status === "NO_SHOW") continue;
      const key = format(new Date(a.startTime), "yyyy-MM-dd");
      const day = map.get(key) ?? { total: 0, conflicts: 0, byVet: [] };
      day.total++;
      if (conflictIds.has(a.id)) day.conflicts++;
      let vet = day.byVet.find((v) => v.id === a.veterinarianId);
      if (!vet) {
        const idx = vets.findIndex((v) => v.id === a.veterinarianId);
        vet = { id: a.veterinarianId, name: a.veterinarian.name, color: VET_COLORS[(idx < 0 ? 0 : idx) % VET_COLORS.length], count: 0 };
        day.byVet.push(vet);
      }
      vet.count++;
      map.set(key, day);
    }
    return map;
  }, [visibleAppointments, conflictIds, vets]);
  const monthSummaryRef = useRef(monthSummary);
  monthSummaryRef.current = monthSummary;

  // Month cell header: the date, then the number of appointments and the split per vet.
  // Absence bars go right below it, so the two never overlap.
  const MonthDateHeader = useMemo(
    () =>
      function MonthHeader({ date: day, label, onDrillDown }: { date: Date; label: string; onDrillDown: () => void }) {
        const sum = monthSummaryRef.current.get(format(day, "yyyy-MM-dd"));
        if (mobileRef.current) {
          // Narrow cells: the date, and below it a coloured badge with the number of appointments
          return (
            <div className="px-0.5 pt-0.5 flex flex-col items-end gap-0.5">
              <button type="button" className="rbc-button-link text-xs" onClick={onDrillDown}>
                {label}
              </button>
              {sum && (
                <span
                  className={cn(
                    "self-center rounded-full px-1.5 text-[10px] font-bold leading-4",
                    sum.conflicts > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"
                  )}
                  title={tRef.current("monthLabel", { count: sum.total })}
                >
                  {sum.total}
                </span>
              )}
            </div>
          );
        }
        return (
          <div className="px-1 pt-0.5">
            <div className="text-right">
              <button type="button" className="rbc-button-link" onClick={onDrillDown}>
                {label}
              </button>
            </div>
            {sum && (
              <div className="mt-1 mb-1.5 flex flex-col items-center text-center gap-0.5">
                <p className="text-sm font-semibold leading-tight text-foreground whitespace-nowrap">
                  {tRef.current("monthLabel", { count: sum.total })}
                  {sum.conflicts > 0 && (
                    <span className="ml-1.5 text-xs text-red-600" title={tRef.current("monthConflicts", { count: sum.conflicts })}>
                      ⚠{sum.conflicts}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap justify-center gap-x-2.5">
                  {sum.byVet.map((v) => (
                    <span key={v.id} className="flex items-center gap-1 text-xs leading-tight text-muted-foreground min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: v.color }} />
                      <span className="truncate max-w-[110px]">{v.name}</span>
                      <span className="font-semibold text-foreground">{v.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      },
    []
  );

  // Keep the current time in the middle of the screen (week/day views, any zoom)
  useEffect(() => {
    if (view === Views.MONTH) return;
    const timer = setTimeout(() => {
      const content = calendarBoxRef.current?.querySelector<HTMLElement>(".rbc-time-content");
      if (!content) return;
      const now = new Date();
      const total = (DAY_END_HOUR - DAY_START_HOUR) * 60;
      const minutes = Math.min(Math.max((now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes(), 0), total);
      const y = (content.scrollHeight * minutes) / total;
      content.scrollTop = Math.max(0, y - content.clientHeight / 2);
    }, 60);
    return () => clearTimeout(timer);
  }, [view, zoom, date, roomColumns]);

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
    if (view === Views.MONTH) return format(date, "MMMM yyyy", { locale: dateLocale });
    if (view === Views.WEEK) {
      const start = startOfWeek(date, { weekStartsOn: 1 });
      const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
      return `${format(start, "d MMM", { locale: dateLocale })} — ${format(end, "d MMM yyyy", { locale: dateLocale })}`;
    }
    return format(date, "EEEE, d MMMM yyyy", { locale: dateLocale });
  }

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    if (multiTouchRef.current) return;
    // A tap on empty space just finishes editing the armed appointment
    if (armedRef.current) {
      setArmedId(null);
      return;
    }
    if (viewRef.current === Views.MONTH) {
      openDayRef.current(slotInfo.start as Date);
      return;
    }
    setPresetStart(slotInfo.start as Date);
    const rid = slotInfo.resourceId as string | undefined;
    setPresetRoomId(rid && rid !== NO_ROOM ? rid : undefined);
    setCreateDialogOpen(true);
  }, []);

  const handleSelectEvent = useCallback((event: CalItem) => {
    if (isLeave(event) || multiTouchRef.current) return;
    if (touchUiRef.current) {
      // The hold that armed it (or a drag of it) ends in a tap: not an "open" request
      if (Date.now() - justArmedAtRef.current < 800 || armedRef.current === event.id) return;
      if (armedRef.current) {
        setArmedId(null);
        return;
      }
    }
    setSelectedAppointment(event.resource);
    setDetailOpen(true);
  }, []);

  const handleEventDrop = useCallback(
    ({ event, start, end, resourceId }: { event: CalEvent; start: Date | string; end: Date | string; resourceId?: string | number }) => {
      const startDate = new Date(start);
      const endDate = new Date(end);
      setArmedId(null);
      // Dropping into another room column also moves the appointment to that room
      // (only in the per-room day view: in week/month views react-big-calendar passes an empty resourceId)
      const column = roomColumnsRef.current?.find((c) => c.id === resourceId);
      const newRoom = !column || column.id === (event.resource.roomId ?? NO_ROOM) ? undefined : column.id === NO_ROOM ? null : column.id;
      const roomObj = newRoom ? roomsRef.current.find((r) => r.id === newRoom) ?? null : null;
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === event.id
            ? { ...a, startTime: startDate, endTime: endDate, ...(newRoom !== undefined ? { roomId: newRoom, room: roomObj } : {}) }
            : a
        )
      );
      startTransition(async () => {
        try {
          await updateAppointmentTime(event.id, startDate, endDate, newRoom);
          toast.success(tRef.current("dragDropSuccess"));
        } catch {
          setAppointments((prev) =>
            prev.map((a) =>
              a.id === event.id
                ? { ...a, startTime: event.resource.startTime, endTime: event.resource.endTime, roomId: event.resource.roomId, room: event.resource.room }
                : a
            )
          );
          toast.error(tRef.current("rescheduleError"));
        }
      });
    },
    []
  );

  handleEventDropRef.current = handleEventDrop;

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

  function handleCreatePrescriptionFromDetail() {
    if (!selectedAppointment) return;
    setPrescriptionApt(selectedAppointment);
    setDetailOpen(false);
    setPrescriptionDialogOpen(true);
  }

  function handleMedicalRecordFromDetail() {
    if (!selectedAppointment) return;
    setRecordVisitId(selectedAppointment.id);
    setDetailOpen(false);
  }

  function handleCreateInvoiceFromDetail() {
    if (!selectedAppointment) return;
    const withPrice = (s: { id: string; name: string; officialName?: string }) => ({
      ...s,
      price: services.find((x) => x.id === s.id)?.price ?? null,
    });
    setInvoicePresetApt({
      id: selectedAppointment.id,
      title: selectedAppointment.title,
      startTime: selectedAppointment.startTime,
      type: selectedAppointment.type,
      service: selectedAppointment.service ? withPrice(selectedAppointment.service) : null,
      extraServices: (selectedAppointment.extraServices ?? []).map(withPrice),
      pet: selectedAppointment.pet,
    });
    setDetailOpen(false);
    setInvoiceDialogOpen(true);
  }

  const eventPropGetter = useCallback(
    (event: CalItem) => {
      if (isLeave(event)) return { style: event.leave.type === "VACATION" ? LEAVE_STYLE.vacation : LEAVE_STYLE.absent };
      const style = getEventStyleForAppointment(event.resource, event.resource.status);
      const className = event.id === armedId ? "vh-armed" : undefined;
      if (conflictIds.has(event.id)) {
        return {
          className,
          style: {
            ...style,
            borderLeftColor: "#EF4444",
            borderColor: "#FCA5A5",
            boxShadow: "inset 0 0 0 1px #FCA5A5",
          },
        };
      }
      return { style, className };
    },
    [conflictIds, armedId]
  );

  // Memoized per-view to avoid remounting events on unrelated state changes
  const EventComponent = useMemo(
    () =>
      function Evt({ event: item }: { event: CalItem }) {
        if (isLeave(item)) {
          const key = item.leave.type === "VACATION" ? "leaveVacation" : "leaveAbsent";
          return (
            <span className="block truncate text-[11px] font-semibold leading-tight">
              {item.leave.type === "VACATION" ? "🌴 " : ""}
              {tRef.current(key, { name: item.leave.name })}
            </span>
          );
        }
        const event = item;
        const apt = event.resource;
        const zoomLevel = zoomRef.current;
        // Day view and the largest zoom have room for the service
        const showService = !!apt.service && (viewRef.current === Views.DAY || zoomLevel === "large");
        // Day view columns are wide: at − and ○ put service and room on the right so everything fits
        const sideLayout = viewRef.current === Views.DAY && zoomLevel !== "large";
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
        const hasRoomConflict = roomConflictIdsRef.current.has(apt.id);

        return (
          <TooltipPrimitive.Root delayDuration={300}>
            <TooltipPrimitive.Trigger asChild>
              <div className="relative h-full w-full overflow-hidden" data-apt-id={apt.id}>
                {/* Armed on a touch screen: pull this bar to change the end time */}
                {touchUiRef.current && armedRef.current === apt.id && !isMonthView && (
                  <div data-resize-handle className="absolute inset-x-0 bottom-0 z-10 h-[45%] max-h-5 flex items-end justify-center">
                    <span className="mb-px h-1 w-6 max-w-[70%] rounded-full bg-primary shadow" />
                  </div>
                )}
                {isMonthView ? (
                  <div className="flex items-center gap-1 overflow-hidden">
                    {hasConflict && <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-red-500" />}
                        {apt.presvetPending && <ShieldAlert className="w-2.5 h-2.5 shrink-0 text-amber-600 flex-none" />}
                    <span className="truncate font-semibold text-xs leading-none">{apt.pet.name}</span>
                  </div>
                ) : (
                  sideLayout ? (
                  <div className="h-full flex gap-3 overflow-hidden">
                    <div className="min-w-0 flex-1 flex flex-col gap-px">
                      <div className="flex items-center gap-1 overflow-hidden">
                        {hasConflict && <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-red-500 flex-none" />}
                        {apt.presvetPending && <ShieldAlert className="w-2.5 h-2.5 shrink-0 text-amber-600 flex-none" />}
                        <span className="font-semibold text-[11px] leading-tight truncate">{apt.pet.name}</span>
                      </div>
                      <span className="text-[10px] leading-tight truncate opacity-80">{apt.veterinarian.name}</span>
                    </div>
                    <div className="min-w-0 max-w-[60%] flex flex-col items-end gap-px text-right">
                      {apt.service && (
                        <span className="text-[10px] leading-tight truncate max-w-full font-medium">
                          {serviceLabelRef.current(apt.service.id) ?? apt.service.name}
                          {!!apt.extraServices?.length && ` +${apt.extraServices.length}`}
                        </span>
                      )}
                      {apt.room && (
                        <span className="text-[10px] leading-tight truncate max-w-full font-semibold" style={{ color: apt.room.color }}>
                          ● {apt.room.name}
                        </span>
                      )}
                    </div>
                  </div>
                  ) : (
                  <div className="h-full flex flex-col justify-start gap-px overflow-hidden">
                    <div className="flex items-center gap-1 overflow-hidden">
                      {hasConflict && <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-red-500 flex-none" />}
                        {apt.presvetPending && <ShieldAlert className="w-2.5 h-2.5 shrink-0 text-amber-600 flex-none" />}
                      <span className="font-semibold text-[11px] leading-tight truncate">
                        {apt.pet.name}
                      </span>
                      {/* Compact zoom: room on the same line, right-aligned */}
                      {zoomLevel === "compact" && apt.room && (
                        <span className="ml-auto pl-1 text-[10px] font-semibold leading-tight truncate shrink" style={{ color: apt.room.color }}>
                          {apt.room.name}
                        </span>
                      )}
                    </div>
                    {showService && (
                      <span className="text-[10px] leading-tight truncate font-medium">
                        {serviceLabelRef.current(apt.service!.id) ?? apt.service!.name}
                        {!!apt.extraServices?.length && ` +${apt.extraServices.length}`}
                      </span>
                    )}
                    <span className="text-[10px] leading-tight truncate opacity-80">
                      {apt.veterinarian.name}
                    </span>
                    {zoomLevel !== "compact" && apt.room && (
                      <span className="text-[10px] leading-tight truncate font-semibold" style={{ color: apt.room.color }}>
                        ● {apt.room.name}
                      </span>
                    )}
                    {durationMin >= 45 && apt.notes && (
                      <span className="text-[9px] leading-tight truncate opacity-60 italic">
                        {apt.notes}
                      </span>
                    )}
                  </div>
                  )
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
                  // not overflow-hidden: the pet popup sits outside this box
                  "z-[9999] relative rounded-xl border bg-popover shadow-xl",
                  hasConflict ? "border-red-300" : "border-border",
                  others.length > 0 ? "w-72" : "w-64",
                  "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
                  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                )}
                data-apt-tooltip=""
              >
                {/* Conflict warning banner */}
                {hasConflict && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-t-[11px] bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                      {hasRoomConflict && apt.room
                        ? trRef.current("conflictRoom", { room: apt.room.name })
                        : tRef.current("conflict", { vet: apt.veterinarian.name })}
                    </p>
                  </div>
                )}

                {/* Group header when multiple appointments overlap */}
                {others.length > 0 && !hasConflict && (
                  <div className="px-3 pt-2.5 pb-1.5 border-b border-border">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {tRef.current("simultaneous", { count: overlapping.length })}
                    </p>
                  </div>
                )}
                {others.length > 0 && hasConflict && (
                  <div className="px-3 pt-2 pb-1.5 border-b border-border">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {tRef.current("simultaneous", { count: overlapping.length })}
                    </p>
                  </div>
                )}

                {/* Current appointment (highlighted) */}
                <AppointmentCard apt={apt} startTime={event.start} endTime={event.end} highlight roomConflict={hasRoomConflict} onPetClick={openPetRef.current} serviceLabel={labelServiceRef.current} />

                {/* Other overlapping appointments */}
                {others.map((oa) => (
                  <AppointmentCard
                    key={oa.id}
                    apt={oa}
                    startTime={new Date(oa.startTime)}
                    endTime={new Date(oa.endTime)}
                    conflict={conflictIdsRef.current.has(oa.id)}
                    onPetClick={openPetRef.current}
                    serviceLabel={labelServiceRef.current}
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
        <div className={cn("flex flex-col gap-3 justify-between", !mobile && "sm:flex-row items-start sm:items-center")}>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate("prev")}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("today")}>
              {calendarI18n.messages.today}
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigate("next")}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className={cn("font-medium ml-2 capitalize", mobile ? "text-xs" : "text-sm")}>{navLabel()}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Vet filter */}
            <select
              aria-label={tr("allVets")}
              value={vetFilter}
              onChange={(e) => setVetFilter(e.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="ALL">{tr("allVets")}</option>
              {vets.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>

            {/* Room filter (checkboxes) */}
            {rooms.length > 0 && (
              <details className="relative">
                <summary className="h-8 list-none cursor-pointer rounded-lg border border-border bg-background px-3 text-sm flex items-center gap-1.5">
                  <DoorOpen className="w-3.5 h-3.5" />
                  {allRoomsSelected ? tr("allRooms") : `${tr("selectRooms")}: ${roomFilter.length}`}
                </summary>
                <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-border bg-popover p-2 shadow-lg space-y-1">
                  <label className="flex items-center gap-2 text-sm px-1 py-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allRoomsSelected}
                      onChange={() => setRoomFilter(allRoomsSelected ? [] : rooms.map((r) => r.id))}
                    />
                    {tr("allRooms")}
                  </label>
                  {rooms.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm px-1 py-0.5 cursor-pointer">
                      <input type="checkbox" checked={roomFilter.includes(r.id)} onChange={() => toggleRoom(r.id)} />
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="truncate">{r.name}</span>
                    </label>
                  ))}
                  {view === Views.DAY && roomFilter.length > ROOMS_PER_SCREEN && (
                    <p className="text-[11px] text-muted-foreground px-1 pt-1">{tr("maxVisible")}</p>
                  )}
                </div>
              </details>
            )}

            {/* Zoom control */}
            {view !== Views.MONTH && (
            <div className="flex rounded-lg border border-border overflow-hidden" title={t("zoom")}>
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
            )}
            {!mobile && (
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
                  {calendarI18n.messages[v as "month" | "week" | "day"]}
                </button>
              ))}
            </div>
            )}
            <Button
              className="bg-primary text-primary-foreground"
              onClick={() => { setPresetStart(undefined); setPresetRoomId(undefined); setCreateDialogOpen(true); }}
            >
              + {mobile ? t("newShort") : t("new")}
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className={cn("flex flex-wrap gap-3", mobile && "hidden")}>
          {services.filter((s) => s.parentId === null && s.color).length > 0
            ? services
                .filter((s) => s.parentId === null && s.color)
                .map((s) => (
                  <span key={s.id} className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color + "88" }} />
                    {s.name}
                  </span>
                ))
            : Object.entries(typeConfig).map(([key, cfg]) => (
                <span key={key} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cfg.border }} />
                  {t(cfg.label)}
                </span>
              ))}
        </div>

        {/* Calendar */}
        <div
          className={cn(
            "rounded-xl border border-border overflow-hidden bg-card",
            "[&_.rbc-calendar]:h-full",
            "[&_.rbc-header]:text-xs [&_.rbc-header]:font-medium [&_.rbc-header]:text-muted-foreground [&_.rbc-header]:border-border",
            // Room columns in day view: the room name is the header, no need to repeat the date per column
            "[&_.rbc-row-resource+.rbc-time-header-cell-single-day]:hidden",
            "[&_.rbc-month-view]:border-none [&_.rbc-month-view]:flex-1",
            "[&_.rbc-month-row]:border-border",
            "[&_.rbc-date-cell]:text-right [&_.rbc-date-cell]:pr-0",
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
            // Phone week: seven narrow columns, so smaller rows and text (see .vh-cal-phone-week)
            mobile && view === Views.WEEK && "vh-cal-phone-week",
            mobile && view === Views.WEEK
              ? zoom === "compact" ? "[&_.rbc-timeslot-group]:min-h-[18px]" : zoom === "normal" ? "[&_.rbc-timeslot-group]:min-h-[28px]" : "[&_.rbc-timeslot-group]:min-h-[48px]"
              : zoom === "compact" ? "[&_.rbc-timeslot-group]:min-h-[36px]" : zoom === "normal" ? "[&_.rbc-timeslot-group]:min-h-[48px]" : "[&_.rbc-timeslot-group]:min-h-[72px]",
            mobile && "vh-cal-phone-h",
            "relative",
            isPending && "opacity-70 pointer-events-none"
          )}
          style={mobile ? undefined : { height: "calc(100vh - 260px)", minHeight: 400 }}
          ref={calendarBoxRef}
        >
          {touchPreview?.ghost && (
            <div
              className="pointer-events-none absolute z-20 rounded-md border-2 border-primary bg-primary/20 px-1 text-[10px] font-semibold leading-tight text-primary shadow-lg overflow-hidden"
              style={touchPreview.ghost}
            >
              {format(touchPreview.start, "HH:mm")}–{format(touchPreview.end, "HH:mm")}
            </div>
          )}
          {touchUi && armedId && (
            <div className="pointer-events-none absolute left-1/2 top-1 z-30 -translate-x-1/2 w-max max-w-[90%] rounded-full bg-foreground/85 px-3 py-1 text-center text-[11px] text-background shadow vh-pop-in">
              {t("touchEditHint")}
            </div>
          )}
          <div className="h-full overflow-x-auto">
          <div
            className="h-full"
            style={roomColumns && roomColumns.length > ROOMS_PER_SCREEN ? { width: `${(roomColumns.length / ROOMS_PER_SCREEN) * 100}%` } : undefined}
          >
          <DnDCalendar
            localizer={localizer}
            events={calendarEvents}
            view={view}
            date={date}
            onNavigate={setDate}
            onView={setView}
            // Clicking a date header opens that day (the mobile list on phones)
            onDrillDown={(day: Date) => openDayRef.current(day)}
            selectable
            resizable
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent as (event: object) => void}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onEventDrop={handleEventDrop as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onEventResize={handleEventResize as any}
            eventPropGetter={eventPropGetter as (event: object) => { style: React.CSSProperties }}
            // Touch screens move/resize an appointment with their own hold-then-drag gesture (above):
            // the library's touch dragging and edge anchors started from passing touches
            draggableAccessor={(e: object) => !isLeave(e) && !touchUi}
            resizableAccessor={(e: object) => !isLeave(e) && !touchUi}
            components={{
              event: EventComponent as (props: { event: object }) => JSX.Element,
              month: { dateHeader: MonthDateHeader as unknown as React.ComponentType<DateHeaderProps> },
              // Phone week: short "lu 26" instead of a truncated "26 lun"
              ...(mobile && {
                week: {
                  header: ({ date: day }: { date: Date }) => (
                    <span className="text-[10px] whitespace-nowrap">
                      {format(day, "EEEEEE", { locale: dateLocale })}{" "}
                      <span className="font-semibold text-foreground">{format(day, "d")}</span>
                    </span>
                  ),
                },
              }),
              resourceHeader: ({ label, resource }: { label: React.ReactNode; resource: object }) => (
                <span className="flex items-center justify-center gap-1.5 text-xs font-semibold py-1" style={{ color: (resource as RoomColumn).color }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: (resource as RoomColumn).color }} />
                  {label}
                </span>
              ),
            }}
            resources={roomColumns}
            resourceIdAccessor={(r: object) => (r as RoomColumn).id}
            resourceTitleAccessor={(r: object) => (r as RoomColumn).name}
            culture={calendarI18n.culture}
            messages={calendarI18n.messages}
            // Side-by-side columns for simultaneous appointments instead of stacking them
            dayLayoutAlgorithm="no-overlap"
            step={15}
            timeslots={2}
            min={new Date(0, 0, 0, DAY_START_HOUR, 0)}
            max={new Date(0, 0, 0, DAY_END_HOUR, 0)}
            popup
          />
          </div>
          </div>
        </div>

        <PetQuickSheet pet={petPreview} onClose={() => setPetPreview(null)} side="right" />

        {/* Create Dialog */}
        <AppointmentDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          vets={vets}
          services={services}
          rooms={rooms}
          presetStart={presetStart}
          presetRoomId={presetRoomId}
          onSaved={handleAppointmentSaved}
        />

        {/* Edit Dialog */}
        {editingAppointment && (
          <AppointmentDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            vets={vets}
            services={services}
            rooms={rooms}
            appointment={editingAppointment}
            onSaved={handleAppointmentSaved}
          />
        )}

        {/* Detail Sheet */}
        {selectedAppointment && (
          <AppointmentDetailSheet
            open={detailOpen}
            services={services}
            onOpenChange={setDetailOpen}
            appointment={selectedAppointment}
            onUpdated={handleAppointmentUpdated}
            onDeleted={handleAppointmentDeleted}
            onEdit={handleEditFromDetail}
            onCreateInvoice={handleCreateInvoiceFromDetail}
            onCreatePrescription={handleCreatePrescriptionFromDetail}
            onCreateMedicalRecord={handleMedicalRecordFromDetail}
          />
        )}

        {/* Invoice Dialog (from appointment) */}
        <InvoiceDialog
          open={invoiceDialogOpen}
          onOpenChange={setInvoiceDialogOpen}
          services={services}
          presetAppointment={invoicePresetApt}
          onSaved={() => { setInvoiceDialogOpen(false); }}
        />

        {/* Medical record of the appointment */}
        <VisitMedicalRecordDialog appointmentId={recordVisitId} onClose={() => setRecordVisitId(null)} onDeleted={() => {}} />

        {/* Prescription Dialog (from appointment) */}
        {prescriptionDialogOpen && prescriptionApt && (
          <PrescriptionDialog
            open={prescriptionDialogOpen}
            onOpenChange={setPrescriptionDialogOpen}
            petId={prescriptionApt.petId}
            petName={prescriptionApt.pet.name}
            veterinarianId={prescriptionApt.veterinarianId}
            appointmentId={prescriptionApt.id}
            appointmentTitle={prescriptionApt.title}
            onSaved={() => { setPrescriptionDialogOpen(false); }}
          />
        )}
      </div>
    </TooltipPrimitive.Provider>
  );
}
