import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Calendar, Users, DollarSign, TrendingUp, Plus, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { format, subDays } from "date-fns";

// Mock revenue data for the last 30 days
function generateRevenueData() {
  return Array.from({ length: 30 }, (_, i) => {
    const date = subDays(new Date(), 29 - i);
    return {
      date: format(date, "dd/MM"),
      revenue: Math.floor(Math.random() * 800) + 200,
    };
  });
}

const mockUpcomingAppointments = [
  { id: "1", time: "09:00", petName: "Max", ownerName: "García", type: "CONSULTATION", status: "SCHEDULED" },
  { id: "2", time: "10:30", petName: "Luna", ownerName: "López", type: "VACCINATION", status: "SCHEDULED" },
  { id: "3", time: "11:00", petName: "Rocky", ownerName: "Martín", type: "CHECKUP", status: "IN_PROGRESS" },
  { id: "4", time: "12:00", petName: "Bella", ownerName: "Sánchez", type: "GROOMING", status: "SCHEDULED" },
  { id: "5", time: "14:30", petName: "Thor", ownerName: "Pérez", type: "SURGERY", status: "SCHEDULED" },
];

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export default async function DashboardPage() {
  const session = await auth();
  const t = await getTranslations("dashboard");
  const revenueData = generateRevenueData();
  const totalMonthRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0);
  const todayRevenue = revenueData[revenueData.length - 1].revenue;

  return (
    <div className="flex flex-col min-h-full">
      <TopBar
        user={session?.user ?? {}}
        title={t("title")}
      />

      <div className="flex-1 p-4 md:p-6 space-y-6">
        {/* Metrics grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <MetricCard
            title={t("todayAppointments")}
            value={mockUpcomingAppointments.length}
            icon={Calendar}
            trend={12}
          />
          <MetricCard
            title={t("dailyRevenue")}
            value={`$${todayRevenue}`}
            icon={DollarSign}
            trend={8}
          />
          <MetricCard
            title={t("monthlyRevenue")}
            value={`$${totalMonthRevenue.toLocaleString()}`}
            icon={TrendingUp}
            trend={5}
          />
          <MetricCard
            title={t("newPatients")}
            value={7}
            icon={Users}
            trend={-3}
          />
        </div>

        {/* Revenue chart + upcoming appointments */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2">
            <RevenueChart data={revenueData} />
          </div>

          {/* Upcoming appointments */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium">{t("upcomingAppointments")}</CardTitle>
              <Link href="/appointments">
                <Button variant="ghost" size="sm" className="text-xs text-primary h-7">
                  {t("viewAll")}
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-2 p-3">
              {mockUpcomingAppointments.map((apt) => (
                <div
                  key={apt.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="w-12 text-xs font-mono text-muted-foreground shrink-0">
                    {apt.time}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{apt.petName}</p>
                    <p className="text-xs text-muted-foreground truncate">{apt.ownerName}</p>
                  </div>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      statusColors[apt.status] ?? ""
                    }`}
                  >
                    {apt.status === "IN_PROGRESS" ? "En curso" : "Prog."}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Alerts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Low stock alert */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                {t("lowStock")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { name: "Amoxicilina 500mg", qty: 5, unit: "tabletas", min: 20 },
                { name: "Vacuna Rabia", qty: 2, unit: "dosis", min: 10 },
                { name: "Vendas elásticas", qty: 8, unit: "unidades", min: 15 },
              ].map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate">{item.name}</span>
                  <span className="text-destructive font-medium shrink-0 ml-2">
                    {item.qty} {item.unit}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Upcoming vaccinations */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                {t("upcomingVaccinations")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { petName: "Max", vaccine: "Rabia", dueDate: "Hoy", urgent: true },
                { petName: "Luna", vaccine: "Moquillo", dueDate: "Mañana", urgent: true },
                { petName: "Rocky", vaccine: "Parvovirus", dueDate: "En 3 días", urgent: false },
              ].map((v) => (
                <div key={v.petName + v.vaccine} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{v.petName}</span>
                    <span className="text-muted-foreground"> — {v.vaccine}</span>
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      v.urgent ? "text-destructive" : "text-amber-600"
                    }`}
                  >
                    {v.dueDate}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* FAB — mobile only */}
      <Link
        href="/appointments/new"
        className="md:hidden fixed bottom-20 right-4 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center z-40 hover:bg-primary/90 transition-colors"
        aria-label={t("newAppointment")}
      >
        <Plus className="w-6 h-6" />
      </Link>
    </div>
  );
}
