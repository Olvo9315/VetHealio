import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { DataTransferPanel } from "@/components/settings/DataTransferPanel";

export default async function DataTransferPage() {
  const session = await auth();
  const t = await getTranslations("dataTransfer");
  if ((session?.user as { role?: string } | undefined)?.role !== "ADMIN") redirect("/settings");

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6">
        <div className="max-w-2xl mx-auto">
          <DataTransferPanel />
        </div>
      </div>
    </div>
  );
}
