import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { getMedicalRecords } from "@/lib/actions/medicalRecords";
import { MedicalRecordsTable } from "@/components/medical-records/MedicalRecordsTable";

export default async function MedicalRecordsPage() {
  const session = await auth();
  const t = await getTranslations("medicalRecords");

  const records = await getMedicalRecords();

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6">
        <MedicalRecordsTable initialRecords={records} />
      </div>
    </div>
  );
}
