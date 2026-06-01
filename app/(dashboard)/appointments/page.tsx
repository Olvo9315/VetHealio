import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { startOfMonth, endOfMonth, addMonths } from "date-fns";
import { TopBar } from "@/components/layout/TopBar";
import { getAppointments, getVeterinarians } from "@/lib/actions/appointments";
import { getServicesFlat } from "@/lib/actions/services";
import { AppointmentsCalendar } from "@/components/appointments/AppointmentsCalendar";
import { MobileAppointmentList } from "@/components/appointments/MobileAppointmentList";

export default async function AppointmentsPage() {
  const session = await auth();
  const t = await getTranslations("appointments");

  // Load ±1 month to have data for calendar navigation
  const from = startOfMonth(addMonths(new Date(), -1));
  const to = endOfMonth(addMonths(new Date(), 1));

  const [appointments, vets, services] = await Promise.all([
    getAppointments(from, to),
    getVeterinarians(),
    getServicesFlat(),
  ]);

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6 flex flex-col min-h-0">
        {/* Desktop calendar */}
        <div className="hidden md:flex flex-col flex-1 min-h-0">
          <AppointmentsCalendar initialAppointments={appointments} vets={vets} services={services} />
        </div>
        {/* Mobile day list */}
        <div className="md:hidden">
          <MobileAppointmentList initialAppointments={appointments} vets={vets} services={services} />
        </div>
      </div>
    </div>
  );
}
