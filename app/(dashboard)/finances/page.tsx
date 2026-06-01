import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import {
  getInvoices,
  getInvoiceStats,
  getRevenueChartData,
} from "@/lib/actions/invoices";
import { getServicesFlat } from "@/lib/actions/services";
import { FinancesStats } from "@/components/finances/FinancesStats";
import { RevenueChart } from "@/components/finances/RevenueChart";
import { InvoicesTable } from "@/components/finances/InvoicesTable";

export default async function FinancesPage() {
  const session = await auth();
  const t = await getTranslations("finances");

  const [invoices, stats, chartData, services] = await Promise.all([
    getInvoices(),
    getInvoiceStats(),
    getRevenueChartData(30),
    getServicesFlat(),
  ]);

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6 space-y-5">
        <FinancesStats stats={stats} />
        <RevenueChart data={chartData} />
        <InvoicesTable initialInvoices={invoices} services={services} />
      </div>
    </div>
  );
}
