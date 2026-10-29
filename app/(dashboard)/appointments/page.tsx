import Link from "next/link";
import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { startOfMonth, endOfMonth, addMonths } from "date-fns";
import { CalendarDays, DoorOpen, List, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { getPresvetDeadline } from "@/lib/actions/presvet";
import { TopBar } from "@/components/layout/TopBar";
import { ViewTabs } from "@/components/layout/ViewTabs";
import { getAppointments, getCalendarLeaves, getVeterinarians } from "@/lib/actions/appointments";
import { getServicesFlat } from "@/lib/actions/services";
import { getRooms } from "@/lib/actions/rooms";
import { AppointmentsCalendar } from "@/components/appointments/AppointmentsCalendar";
import { MobileAppointmentList } from "@/components/appointments/MobileAppointmentList";
import { AppointmentsList } from "@/components/appointments/AppointmentsList";
import { WaitingRoom } from "@/components/appointments/WaitingRoom";
import { cn } from "@/lib/utils";

type View = "calendar" | "list" | "waiting";

export default async function AppointmentsPage({ searchParams }: { searchParams: { view?: string } }) {
  const session = await auth();
  const t = await getTranslations("appointments");
  const view: View = searchParams.view === "list" || searchParams.view === "waiting" ? searchParams.view : "calendar";

  const tabs: { id: View; icon: typeof List; label: string }[] = [
    { id: "calendar", icon: CalendarDays, label: t("viewCalendar") },
    { id: "waiting", icon: DoorOpen, label: t("viewWaiting") },
    { id: "list", icon: List, label: t("viewList") },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6 flex flex-col min-h-0 gap-4">
        <ViewTabs
          active={view}
          tabs={tabs.map((tab) => ({ ...tab, href: tab.id === "calendar" ? "/appointments" : `/appointments?view=${tab.id}` }))}
        />
        <PresvetDeadline />
        {view === "calendar" ? <CalendarView /> : view === "list" ? <AppointmentsList vets={await getVeterinarians()} /> : <WaitingRoom />}
      </div>
    </div>
  );
}

// Reminder above the calendar when reporting antibiotic prescriptions to PRESVET is due (3 days ahead)
async function PresvetDeadline() {
  const d = await getPresvetDeadline();
  if (!d) return null;
  const daysLeft = Math.ceil((d.due.getTime() - Date.now()) / (24 * 3600 * 1000));
  if (daysLeft > 3) return null;
  const t = await getTranslations("presvet");
  return (
    <Link
      href="/medical-records/presvet"
      className={cn(
        "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm",
        daysLeft < 0
          ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
      )}
    >
      <ShieldAlert className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        {daysLeft < 0
          ? t("deadlineOverdue", { count: d.count, days: -daysLeft })
          : t("deadlineSoon", { count: d.count, date: format(d.due, "dd/MM") })}
      </span>
      <span className="font-medium underline">{t("open")}</span>
    </Link>
  );
}

async function CalendarView() {
  // Load ±1 month to have data for calendar navigation
  const from = startOfMonth(addMonths(new Date(), -1));
  const to = endOfMonth(addMonths(new Date(), 1));

  const [appointments, vets, services, rooms, leaves] = await Promise.all([
    getAppointments(from, to),
    getVeterinarians(),
    getServicesFlat(),
    getRooms(),
    getCalendarLeaves(from, to),
  ]);

  return (
    <>
      {/* Desktop calendar */}
      <div className="hidden md:flex flex-col flex-1 min-h-0">
        <AppointmentsCalendar initialAppointments={appointments} vets={vets} services={services} rooms={rooms} leaves={leaves} />
      </div>
      {/* Mobile day list */}
      <div className="md:hidden">
        <MobileAppointmentList initialAppointments={appointments} vets={vets} services={services} rooms={rooms} leaves={leaves} />
      </div>
    </>
  );
}
