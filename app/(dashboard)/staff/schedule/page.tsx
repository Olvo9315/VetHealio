import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { getShifts } from "@/lib/actions/shifts";
import { getStaffList } from "@/lib/actions/staff";
import { TeamScheduleCalendar } from "@/components/staff/TeamScheduleCalendar";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function StaffSchedulePage() {
  const session = await auth();
  const user = session?.user as { id: string; role: Role } | undefined;
  if (!user) redirect("/login");

  let hasAccess = user.role === "ADMIN";
  if (!hasAccess && user.role === "VETERINARIAN") {
    const profile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
    hasAccess = profile?.canManageStaff ?? false;
  }
  if (!hasAccess) redirect("/");

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 1);

  const [shifts, staffProfiles] = await Promise.all([
    getShifts(from, to),
    getStaffList(),
  ]);

  const staffMembers = staffProfiles.map((s) => ({
    id: s.user.id,
    name: s.user.name,
    role: s.user.role,
  }));

  const t = await getTranslations("staff");

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("teamSchedule")} />
      <div className="flex-1 p-4 md:p-6">
        <Link href="/staff" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 px-2 py-1 rounded-md hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
          {t("title")}
        </Link>
        <TeamScheduleCalendar initialShifts={shifts as never} staffMembers={staffMembers} />
      </div>
    </div>
  );
}
