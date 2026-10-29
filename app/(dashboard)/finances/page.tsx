import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { BookOpenCheck, FileText, Receipt, ShieldCheck, Wallet } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { ViewTabs } from "@/components/layout/ViewTabs";
import {
  getInvoices,
  getInvoiceStats,
  getRevenueChartData,
} from "@/lib/actions/invoices";
import { getServicesFlat } from "@/lib/actions/services";
import { FinancesStats } from "@/components/finances/FinancesStats";
import { RevenueChart } from "@/components/finances/RevenueChart";
import { InvoicesTable } from "@/components/finances/InvoicesTable";
import { CashReportView } from "@/components/finances/CashReportView";
import { InvoiceBookView } from "@/components/finances/InvoiceBookView";
import { VerifactuView } from "@/components/finances/VerifactuView";
import { EstimatesView } from "@/components/estimates/EstimatesView";
import { can } from "@/lib/permissions";

type Tab = "bills" | "estimates" | "cash" | "book" | "verifactu";

export default async function FinancesPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await auth();
  const t = await getTranslations("finances");
  // The cash count and the invoice book are for staff who handle money
  const canMoney = await can("invoice.write");
  const tab: Tab =
    searchParams.tab === "estimates" || (canMoney && (searchParams.tab === "cash" || searchParams.tab === "book" || searchParams.tab === "verifactu"))
      ? (searchParams.tab as Tab)
      : "bills";

  const tabs: { id: Tab; icon: typeof Receipt; label: string }[] = [
    { id: "bills", icon: Receipt, label: t("tabBills") },
    { id: "estimates", icon: FileText, label: t("tabEstimates") },
    ...(canMoney
      ? [
          { id: "cash" as const, icon: Wallet, label: t("tabCash") },
          { id: "book" as const, icon: BookOpenCheck, label: t("tabBook") },
          { id: "verifactu" as const, icon: ShieldCheck, label: "VeriFactu" },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6 space-y-5">
        <ViewTabs active={tab} tabs={tabs.map((x) => ({ ...x, href: x.id === "bills" ? "/finances" : `/finances?tab=${x.id}` }))} />
        {tab === "estimates" ? <EstimatesView /> : tab === "cash" ? <CashReportView /> : tab === "book" ? <InvoiceBookView /> : tab === "verifactu" ? <VerifactuView /> : <Bills />}
      </div>
    </div>
  );
}

async function Bills() {
  const [invoices, stats, chartData, services] = await Promise.all([
    getInvoices(),
    getInvoiceStats(),
    getRevenueChartData(30),
    getServicesFlat(),
  ]);
  return (
    <>
      <FinancesStats stats={stats} />
      <RevenueChart data={chartData} />
      <InvoicesTable initialInvoices={invoices} services={services} />
    </>
  );
}
