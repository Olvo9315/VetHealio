import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type Actor, type Permission, type Role } from "@/lib/permissions-core";

export { grantedPermissions, hasPermission } from "@/lib/permissions-core";
export type { Actor, Permission } from "@/lib/permissions-core";

// The signed-in staff member, with the head-vet flag from their staff profile (one query per request).
// Checked against the database: a session whose user no longer exists (removed staff member, data
// restored from another copy) counts as signed out instead of failing on the first save; a changed
// role applies at once.
export const getActor = cache(async (): Promise<(Actor & { id: string }) | null> => {
  const session = await auth();
  const sessionUser = session?.user as { id?: string; role?: Role } | undefined;
  if (!sessionUser?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true, staffProfile: { select: { canManageStaff: true } } },
  });
  if (!user) return null;
  const isHeadVet = user.role === "VETERINARIAN" && (user.staffProfile?.canManageStaff ?? false);
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
