import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Calendar, Users, Euro, TrendingUp, Plus, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getDashboardData, TIMEZONE } from "@/lib/dashboard";

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

const currency = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const timeFormat = new Intl.DateTimeFormat("es-ES", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" });

export default async function DashboardPage() {
  const session = await auth();
  const t = await getTranslations("dashboard");
  const ta = await getTranslations("appointments");
  const data = await getDashboardData();

  function dueLabel(days: number) {
    if (days < 0) return t("overdueDays", { count: -days });
    if (days === 0) return t("today");
    if (days === 1) return t("tomorrow");
    return t("inDays", { count: days });
  }

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
            value={data.todayAppointments.value}
            icon={Calendar}
            trend={data.todayAppointments.trend}
            trendLabel={t("vsLastWeek")}
          />
          <MetricCard
            title={t("dailyRevenue")}
            value={currency.format(data.todayRevenue.value)}
            icon={Euro}
            trend={data.todayRevenue.trend}
            trendLabel={t("vsLastWeek")}
          />
          <MetricCard
            title={t("monthlyRevenue")}
            value={currency.format(data.monthRevenue.value)}
            icon={TrendingUp}
            trend={data.monthRevenue.trend}
            trendLabel={t("vsLastMonth")}
          />
          <MetricCard
            title={t("newPatients")}
            value={data.newPatients.value}
            icon={Users}
            trend={data.newPatients.trend}
            trendLabel={t("vsLastMonth")}
          />
        </div>

        {/* Revenue chart + upcoming appointments */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2">
            <RevenueChart data={data.revenueSeries} />
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
              {data.upcoming.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">{t("noAppointments")}</p>
              )}
              {data.upcoming.map((apt) => (
                <div
                  key={apt.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="w-12 text-xs font-mono text-muted-foreground shrink-0 leading-tight">
                    {timeFormat.format(apt.startTime)}
                    {!apt.isToday && (
                      <span className="block text-[10px]">
                        {apt.dateKey.slice(8, 10)}/{apt.dateKey.slice(5, 7)}
                      </span>
                    )}
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
                    {apt.status === "IN_PROGRESS" ? ta("inProgress") : ta("scheduled")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Alerts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Low stock alert — only with the inventory module */}
          {data.inventoryEnabled && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                {t("lowStock")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.lowStock.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("noLowStock")}</p>
              )}
              {data.lowStock.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate">{item.name}</span>
                  <span className="text-destructive font-medium shrink-0 ml-2">
                    {item.quantity} {item.unit}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          )}

          {/* Upcoming vaccinations */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                {t("upcomingVaccinations")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.vaccinations.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("noVaccinations")}</p>
              )}
              {data.vaccinations.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0 truncate">
                    <span className="font-medium">{v.petName}</span>
                    <span className="text-muted-foreground"> — {v.vaccineName}</span>
                  </div>
                  <span
                    className={`text-xs font-medium shrink-0 ml-2 ${
                      v.daysUntil <= 1 ? "text-destructive" : "text-amber-600"
                    }`}
                  >
                    {dueLabel(v.daysUntil)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* FAB — mobile only */}
      <Link
        href="/appointments"
        className="md:hidden fixed bottom-20 right-4 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center z-40 hover:bg-primary/90 transition-colors"
        aria-label={t("newAppointment")}
      >
        <Plus className="w-6 h-6" />
      </Link>
    </div>
  );
}
