import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { getStaffList } from "@/lib/actions/staff";
import { StaffList } from "@/components/staff/StaffList";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export default async function StaffPage() {
  const session = await auth();
  const user = session?.user as { id: string; role: Role } | undefined;

  if (!user) redirect("/login");

  // Check access
  let hasAccess = user.role === "ADMIN";
  if (!hasAccess && user.role === "VETERINARIAN") {
    const profile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
    hasAccess = profile?.canManageStaff ?? false;
  }
  if (!hasAccess) redirect("/");

  const t = await getTranslations("staff");
  const staff = await getStaffList();

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6">
        <StaffList staff={staff} isAdmin={user.role === "ADMIN"} />
      </div>
    </div>
  );
}
