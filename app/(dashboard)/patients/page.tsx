import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { getPets } from "@/lib/actions/patients";
import { PatientsTable } from "@/components/patients/PatientsTable";

export default async function PatientsPage() {
  const session = await auth();
  const t = await getTranslations("patients");
  const pets = await getPets({ isActive: true });

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6">
        <PatientsTable initialPets={pets} />
      </div>
    </div>
  );
}
