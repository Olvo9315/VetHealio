import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";

export default async function MedicalRecordsPage() {
  const session = await auth();
  const t = await getTranslations("medicalRecords");

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6">
        <div className="text-center text-muted-foreground py-20">
          Historiales médicos próximamente
        </div>
      </div>
    </div>
  );
}
