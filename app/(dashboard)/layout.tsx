import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar showStaff={showStaff} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav showStaff={showStaff} />
    </div>
  );
}
