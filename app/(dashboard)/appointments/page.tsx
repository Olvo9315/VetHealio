import Link from "next/link";
import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { startOfMonth, endOfMonth, addMonths } from "date-fns";
import { CalendarDays, DoorOpen, List } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
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
        <nav className="flex gap-1 rounded-lg border p-0.5 bg-muted/40 self-start max-w-full overflow-x-auto no-scrollbar">
          {tabs.map(({ id, icon: Icon, label }) => (
            <Link
              key={id}
              href={id === "calendar" ? "/appointments" : `/appointments?view=${id}`}
              className={cn(
                "flex items-center gap-1.5 px-3 h-8 text-sm rounded-md transition-colors whitespace-nowrap shrink-0",
                view === id ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>
        {view === "calendar" ? <CalendarView /> : view === "list" ? <AppointmentsList vets={await getVeterinarians()} /> : <WaitingRoom />}
      </div>
    </div>
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
