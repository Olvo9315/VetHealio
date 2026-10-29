import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { getMedicalRecords } from "@/lib/actions/medicalRecords";
import { MedicalRecordsTable } from "@/components/medical-records/MedicalRecordsTable";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";

export default async function MedicalRecordsPage() {
  const session = await auth();
  const t = await getTranslations("medicalRecords");

  const [records, presvetPending] = await Promise.all([
    getMedicalRecords(),
    prisma.prescription.count({ where: { presvetStatus: { in: ["PENDING", "CHANGED"] } } }),
  ]);
  const tp = await getTranslations("presvet");

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6 space-y-3">
        <Link
          href="/medical-records/presvet"
          className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm hover:bg-muted/50"
        >
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="flex-1">{presvetPending ? tp("pendingBanner", { count: presvetPending }) : tp("bannerNone")}</span>
          <span className="font-medium underline">{tp("open")}</span>
        </Link>
        <MedicalRecordsTable initialRecords={records} />
      </div>
    </div>
  );
}
