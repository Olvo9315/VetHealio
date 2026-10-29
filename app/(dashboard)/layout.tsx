import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getClinic } from "@/lib/clinic";
import { StagingBanner } from "@/components/layout/StagingBanner";
import { getLicenseState } from "@/lib/license";
import { MODULES } from "@/lib/modules";
import { getActor, grantedPermissions } from "@/lib/permissions";
import { PermissionsProvider } from "@/components/layout/PermissionsProvider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as { id: string; role: Role };
  let showStaff = user.role === "ADMIN";
  if (!showStaff && user.role === "VETERINARIAN") {
    const profile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
    showStaff = profile?.canManageStaff ?? false;
  }

  const { modules } = await getLicenseState();
  showStaff = showStaff && modules.includes("staff");
  // Routes of modules this clinic has not licensed are hidden from navigation
  const hiddenRoutes = MODULES.filter((m) => !modules.includes(m.key)).flatMap((m) => m.routes);

  const { name, logoUrl } = await getClinic();
  const permissions = grantedPermissions(await getActor());
  const clinic = { name, logoUrl };

  return (
    <PermissionsProvider permissions={permissions}>
    {/* Phones scroll the whole page (not an inner box) so the browser can tuck its address bar away */}
    <div className="flex min-h-dvh md:h-screen md:overflow-hidden bg-background print:block print:h-auto print:min-h-0 print:overflow-visible">
      <Sidebar showStaff={showStaff} hiddenRoutes={hiddenRoutes} clinic={clinic} />
      <div className="flex-1 flex flex-col min-w-0 md:overflow-hidden print:block print:overflow-visible">
        {process.env.STAGING_DATABASE_URL && <StagingBanner />}
        <main className="flex-1 md:overflow-y-auto pb-16 md:pb-0 vh-main print:overflow-visible print:pb-0">
          {children}
        </main>
      </div>
      <BottomNav showStaff={showStaff} hiddenRoutes={hiddenRoutes} clinic={clinic} />
    </div>
    </PermissionsProvider>
  );
}
