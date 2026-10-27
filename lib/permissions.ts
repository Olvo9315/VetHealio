import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type Actor, type Permission, type Role } from "@/lib/permissions-core";

export { grantedPermissions, hasPermission } from "@/lib/permissions-core";
export type { Actor, Permission } from "@/lib/permissions-core";

// The signed-in staff member, with the head-vet flag from their staff profile (one query per request)
export const getActor = cache(async (): Promise<(Actor & { id: string }) | null> => {
  const session = await auth();
  const user = session?.user as { id?: string; role?: Role } | undefined;
  if (!user?.id || !user.role) return null;
  let isHeadVet = false;
  if (user.role === "VETERINARIAN") {
    const profile = await prisma.staffProfile.findUnique({ where: { userId: user.id }, select: { canManageStaff: true } });
    isHeadVet = profile?.canManageStaff ?? false;
  }
  return { id: user.id, role: user.role, isHeadVet };
});

export async function can(permission: Permission) {
  return hasPermission(await getActor(), permission);
}

// For server actions: throws when the current user lacks the permission
export async function requirePermission(permission: Permission) {
  if (!(await can(permission))) throw new Error(`Forbidden: ${permission}`);
}

// For server actions that only need a signed-in user; returns their id
export async function requireUserId() {
  const actor = await getActor();
  if (!actor) throw new Error("Unauthorized");
  return actor.id;
}
