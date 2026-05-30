import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { getStaffById } from "@/lib/actions/staff";
import { getShiftsByUser } from "@/lib/actions/shifts";
import { checkAndNotifyCertExpiry } from "@/lib/actions/certifications";
import { StaffProfileTabs } from "@/components/staff/StaffProfileTabs";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface StaffDetailPageProps {
  params: { id: string };
}

export default async function StaffDetailPage({ params }: StaffDetailPageProps) {
  const session = await auth();
  const user = session?.user as { id: string; role: Role } | undefined;

  if (!user) redirect("/login");

  let hasAccess = user.role === "ADMIN";
  let canManage = user.role === "ADMIN";
  if (!hasAccess && user.role === "VETERINARIAN") {
    const ownProfile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
    hasAccess = ownProfile?.canManageStaff ?? false;
    canManage = ownProfile?.canManageStaff ?? false;
  }
  if (!hasAccess) redirect("/");

  const staff = await getStaffById(params.id);
  if (!staff) notFound();

  // Notify about expiring certs (fire-and-forget, don't block render)
  checkAndNotifyCertExpiry(params.id).catch(() => {});

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 30);
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 60);
  const shifts = await getShiftsByUser(staff.user.id, weekStart, weekEnd);

  const t = await getTranslations("staff");

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={staff.user.name} />
      <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
        <Link href="/staff" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 px-2 py-1 rounded-md hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
          {t("title")}
        </Link>
        <StaffProfileTabs
          staff={staff as never}
          shifts={shifts}
          isAdmin={user.role === "ADMIN"}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
