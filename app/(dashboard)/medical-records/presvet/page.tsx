import Link from "next/link";
import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { PresvetView } from "@/components/medical-records/PresvetView";

export default async function PresvetPage() {
  const session = await auth();
  const t = await getTranslations("presvet");
  const tm = await getTranslations("medicalRecords");
  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full space-y-4">
        <Link href="/medical-records" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4" />
          {tm("title")}
        </Link>
        <PresvetView />
      </div>
    </div>
  );
}
