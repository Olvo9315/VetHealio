import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { getPets } from "@/lib/actions/patients";
import { PatientsTable } from "@/components/patients/PatientsTable";
import Link from "next/link";
import { Users } from "lucide-react";
import { findDuplicateOwners } from "@/lib/actions/owners";

export default async function PatientsPage() {
  const session = await auth();
  const t = await getTranslations("patients");
  const [pets, duplicates] = await Promise.all([getPets({ isActive: true }), findDuplicateOwners()]);
  const to = await getTranslations("owners");

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6 space-y-3">
        {duplicates.length > 0 && (
          <Link
            href="/owners/duplicates"
            className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-2.5 text-sm hover:bg-amber-100 dark:hover:bg-amber-950/50"
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="flex-1">{to("duplicatesFound", { count: duplicates.length })}</span>
            <span className="font-medium underline">{to("review")}</span>
          </Link>
        )}
        <PatientsTable initialPets={pets} />
      </div>
    </div>
  );
}
