import Link from "next/link";
import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { BookOpenCheck, Receipt, ShieldCheck, Wallet } from "lucide-react";
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
import { CashReportView } from "@/components/finances/CashReportView";
import { InvoiceBookView } from "@/components/finances/InvoiceBookView";
import { VerifactuView } from "@/components/finances/VerifactuView";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Tab = "bills" | "cash" | "book" | "verifactu";

export default async function FinancesPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await auth();
  const t = await getTranslations("finances");
  // The cash count and the invoice book are for staff who handle money
  const canMoney = await can("invoice.write");
  const tab: Tab = canMoney && (searchParams.tab === "cash" || searchParams.tab === "book" || searchParams.tab === "verifactu") ? searchParams.tab : "bills";

  const tabs: { id: Tab; icon: typeof Receipt; label: string }[] = [
    { id: "bills", icon: Receipt, label: t("tabBills") },
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
        <nav className="flex gap-1 rounded-lg border p-0.5 bg-muted/40 w-fit max-w-full overflow-x-auto no-scrollbar print:hidden">
          {tabs.map(({ id, icon: Icon, label }) => (
            <Link
              key={id}
              href={id === "bills" ? "/finances" : `/finances?tab=${id}`}
              className={cn(
                "flex items-center gap-1.5 px-3 h-8 text-sm rounded-md transition-colors whitespace-nowrap shrink-0",
                tab === id ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>
        {tab === "cash" ? <CashReportView /> : tab === "book" ? <InvoiceBookView /> : tab === "verifactu" ? <VerifactuView /> : <Bills />}
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
