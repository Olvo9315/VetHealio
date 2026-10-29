import Link from "next/link";
import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { findDuplicateOwners } from "@/lib/actions/owners";
import { OwnerDuplicatesList } from "@/components/patients/OwnerDuplicates";

export default async function OwnerDuplicatesPage() {
  const session = await auth();
  const t = await getTranslations("owners");
  const tp = await getTranslations("patients");
  const groups = await findDuplicateOwners();
  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("duplicatesTitle")} />
      <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full space-y-4">
        <Link href="/patients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4" />
          {tp("title")}
        </Link>
        <OwnerDuplicatesList groups={groups} />
      </div>
    </div>
  );
}
