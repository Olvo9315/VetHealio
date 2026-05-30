import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { getLeaveRequests } from "@/lib/actions/leaveRequests";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { LeaveRequestsTable } from "@/components/staff/LeaveRequestsTable";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function LeaveRequestsPage() {
  const session = await auth();
  const user = session?.user as { id: string; role: Role } | undefined;
  if (!user) redirect("/login");

  let hasAccess = user.role === "ADMIN";
  if (!hasAccess && user.role === "VETERINARIAN") {
    const profile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
    hasAccess = profile?.canManageStaff ?? false;
  }
  if (!hasAccess) redirect("/");

  const leaves = await getLeaveRequests({ status: "PENDING" });
  const t = await getTranslations("staff");

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("leaveRequests")} />
      <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
        <Link href="/staff" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 px-2 py-1 rounded-md hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
          {t("title")}
        </Link>
        <LeaveRequestsTable leaves={leaves as never} />
      </div>
    </div>
  );
}
