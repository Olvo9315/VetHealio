import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import {
  getInventoryItems,
  getInventoryStats,
  getDistinctCategories,
} from "@/lib/actions/inventory";
import { InventoryStatsCards } from "@/components/inventory/InventoryStats";
import { InventoryTable } from "@/components/inventory/InventoryTable";

export default async function InventoryPage() {
  const session = await auth();
  const t = await getTranslations("inventory");

  const [items, stats, categories] = await Promise.all([
    getInventoryItems(),
    getInventoryStats(),
    getDistinctCategories(),
  ]);

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6 space-y-5">
        <InventoryStatsCards stats={stats} />
        <InventoryTable initialItems={items} categories={categories} />
      </div>
    </div>
  );
}
