"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { fileUrl } from "@/lib/storage";
import { assertModule } from "@/lib/license";
import { getActor, hasPermission } from "@/lib/permissions";

// ---- RBAC helpers ----

async function requireAdminOrManager() {
  const actor = await getActor();
  if (!actor) throw new Error("Unauthorized");
  if (!hasPermission(actor, "staff.manage")) throw new Error("Forbidden");
  return actor;
}

async function activeAdminCount(excludingUserId?: string) {
  return prisma.user.count({
    where: {
      role: "ADMIN",
      ...(excludingUserId ? { id: { not: excludingUserId } } : {}),
      OR: [{ staffProfile: null }, { staffProfile: { isActive: true } }],
    },
  });
}

// ---- Schemas ----

const createStaffSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.nativeEnum(Role),
  phone: z.string().max(20).optional().or(z.literal("")),
});

const updateProfileSchema = z.object({
  specialization: z.string().max(100).optional().or(z.literal("")),
  licenseNumber: z.string().max(50).optional().or(z.literal("")),
  education: z.string().max(500).optional().or(z.literal("")),
  salaryAmount: z.coerce.number().positive().optional().or(z.literal("")),
  salaryType: z.enum(["HOURLY", "MONTHLY"]).optional(),
  hireDate: z.string().optional().or(z.literal("")),
  contractType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACTOR"]).optional(),
  canManageStaff: z.boolean().optional(),
  annualLeaveDays: z.coerce.number().int().min(0).optional(),
  weeklyTemplate: z.record(z.string(), z.string()).optional(),
  emergencyName: z.string().max(100).optional().or(z.literal("")),
  emergencyPhone: z.string().max(20).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  diplomaPath: z.string().optional().or(z.literal("")),
  contractPath: z.string().optional().or(z.literal("")),
});

// ---- Actions ----

export async function getStaffList() {
  await assertModule("staff");
  await requireAdminOrManager();
  return prisma.staffProfile.findMany({
    include: { user: { select: { id: true, name: true, email: true, role: true, avatar: true, phone: true } } },
    orderBy: { user: { name: "asc" } },
  });
}

export async function getStaffById(id: string) {
  await assertModule("staff");
  await requireAdminOrManager();
  return prisma.staffProfile.findUnique({
    where: { id },
    include: {
      user: true,
      leaveRequests: { orderBy: { createdAt: "desc" } },
      certifications: { orderBy: { expiryDate: "asc" } },
      performanceReviews: {
        include: { reviewer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      auditLogs: {
        include: { changedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
}

export async function createStaffMember(data: z.infer<typeof createStaffSchema>) {
  await assertModule("staff");
  const admin = await requireAdminOrManager();
  const parsed = createStaffSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };
  if (parsed.data.role === "ADMIN" && !hasPermission(admin, "staff.assignAdmin")) {
    return { error: { formErrors: ["adminOnly"], fieldErrors: {} } };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: { formErrors: ["emailInUse"], fieldErrors: {} } };

  const hashed = await bcrypt.hash(parsed.data.password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        name: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
        email: parsed.data.email,
        password: hashed,
        role: parsed.data.role,
        phone: parsed.data.phone || null,
      },
    });
    const profile = await tx.staffProfile.create({ data: { userId: user.id } });
    await tx.staffAuditLog.create({
      data: {
        staffProfileId: profile.id,
        changedById: admin.id,
        field: "created",
        newValue: parsed.data.role,
      },
    });
    return { user, profile };
  });

  revalidatePath("/staff");
  return { staff: result };
}

export async function updateStaffProfile(id: string, data: z.infer<typeof updateProfileSchema>) {
  await assertModule("staff");
  const actor = await requireAdminOrManager();
  const parsed = updateProfileSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const existing = await prisma.staffProfile.findUnique({ where: { id }, include: { user: { select: { role: true } } } });
  if (!existing) return { error: { formErrors: ["Not found"], fieldErrors: {} } };

  // The head-vet flag only means something for veterinarians
  const canManageStaff = existing.user.role === "VETERINARIAN" ? parsed.data.canManageStaff : false;

  // Every changed field goes to the audit log
  const auditFields = [
    "specialization", "licenseNumber", "education", "salaryAmount", "salaryType", "hireDate",
    "contractType", "canManageStaff", "annualLeaveDays", "weeklyTemplate", "emergencyName",
    "emergencyPhone", "notes", "diplomaPath", "contractPath",
  ] as const;
  const normalize = (v: unknown): string | null => {
    if (v === undefined || v === null || v === "") return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  const incoming: Record<string, unknown> = { ...parsed.data, canManageStaff };
  const auditEntries: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  for (const field of auditFields) {
    if (!(field in incoming) || incoming[field] === undefined) continue;
    const oldVal = normalize(existing[field]);
    const newVal = normalize(field === "hireDate" && incoming[field] ? String(incoming[field]).slice(0, 10) : incoming[field]);
    if (oldVal !== newVal) auditEntries.push({ field, oldValue: oldVal, newValue: newVal });
  }

  const profile = await prisma.$transaction(async (tx) => {
    const updated = await tx.staffProfile.update({
      where: { id },
      data: {
        specialization: parsed.data.specialization || null,
        licenseNumber: parsed.data.licenseNumber || null,
        education: parsed.data.education || null,
        salaryAmount: parsed.data.salaryAmount ? Number(parsed.data.salaryAmount) : null,
        salaryType: parsed.data.salaryType,
        hireDate: parsed.data.hireDate ? new Date(parsed.data.hireDate) : undefined,
        contractType: parsed.data.contractType,
        canManageStaff,
        annualLeaveDays: parsed.data.annualLeaveDays,
        weeklyTemplate: parsed.data.weeklyTemplate as Record<string, string> | undefined,
        emergencyName: parsed.data.emergencyName || null,
        emergencyPhone: parsed.data.emergencyPhone || null,
        notes: parsed.data.notes || null,
        diplomaPath: parsed.data.diplomaPath || null,
        contractPath: parsed.data.contractPath || null,
      },
    });
    for (const entry of auditEntries) {
      await tx.staffAuditLog.create({
        data: { staffProfileId: id, changedById: actor.id, ...entry },
      });
    }
    return updated;
  });

  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
  return { profile };
}

export async function deactivateStaff(id: string) {
  await assertModule("staff");
  const actor = await requireAdminOrManager();
  const target = await prisma.staffProfile.findUnique({ where: { id }, select: { userId: true, user: { select: { role: true } } } });
  if (!target) throw new Error("Not found");
  if (target.userId === actor.id) throw new Error("cannotChangeSelf");
  if (target.user.role === "ADMIN" && !hasPermission(actor, "staff.assignAdmin")) throw new Error("adminOnly");
  if (target.user.role === "ADMIN" && (await activeAdminCount(target.userId)) === 0) throw new Error("lastAdmin");
  await prisma.$transaction(async (tx) => {
    await tx.staffProfile.update({ where: { id }, data: { isActive: false } });
    await tx.staffAuditLog.create({
      data: { staffProfileId: id, changedById: actor.id, field: "isActive", oldValue: "true", newValue: "false" },
    });
  });
  revalidatePath("/staff");
}

export async function reactivateStaff(id: string) {
  await assertModule("staff");
  const actor = await requireAdminOrManager();
  const target = await prisma.staffProfile.findUnique({ where: { id }, select: { user: { select: { role: true } } } });
  if (!target) throw new Error("Not found");
  if (target.user.role === "ADMIN" && !hasPermission(actor, "staff.assignAdmin")) throw new Error("adminOnly");
  await prisma.$transaction(async (tx) => {
    await tx.staffProfile.update({ where: { id }, data: { isActive: true } });
    await tx.staffAuditLog.create({
      data: { staffProfileId: id, changedById: actor.id, field: "isActive", oldValue: "false", newValue: "true" },
    });
  });
  revalidatePath("/staff");
}

export async function getSignedDocumentUrl(path: string) {
  await assertModule("staff");
  await requireAdminOrManager();
  return fileUrl(path);
}

export async function getLeaveBalance(staffProfileId: string, year: number) {
  await assertModule("staff");
  await requireAdminOrManager();
  const profile = await prisma.staffProfile.findUnique({
    where: { id: staffProfileId },
    select: { annualLeaveDays: true },
  });
  if (!profile) return null;

  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const approvedLeaves = await prisma.leaveRequest.findMany({
    where: {
      staffProfileId,
      status: "APPROVED",
      type: "VACATION",
      startDate: { gte: start, lt: end },
    },
  });

  const usedDays = approvedLeaves.reduce((sum, leave) => {
    const ms = leave.endDate.getTime() - leave.startDate.getTime();
    return sum + Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1;
  }, 0);

  return {
    limit: profile.annualLeaveDays,
    used: usedDays,
    remaining: Math.max(0, profile.annualLeaveDays - usedDays),
  };
}

// Changes a staff member's role. Head vets and admins may do it; only admins may grant or
// take away the admin role. Nobody can change their own role, and the clinic always keeps
// at least one active admin. The change is written to the audit log.
export async function changeStaffRole(id: string, role: Role) {
  await assertModule("staff");
  const actor = await requireAdminOrManager();
  if (!Object.values(Role).includes(role)) return { error: "invalidRole" };

  const target = await prisma.staffProfile.findUnique({
    where: { id },
    select: { userId: true, canManageStaff: true, user: { select: { role: true } } },
  });
  if (!target) return { error: "notFound" };
  const oldRole = target.user.role;
  if (oldRole === role) return { success: true };
  if (target.userId === actor.id) return { error: "cannotChangeSelf" };
  if ((oldRole === "ADMIN" || role === "ADMIN") && !hasPermission(actor, "staff.assignAdmin")) return { error: "adminOnly" };
  if (oldRole === "ADMIN" && (await activeAdminCount(target.userId)) === 0) return { error: "lastAdmin" };

  // Leaving the veterinarian role also removes the head-vet flag
  const dropHeadVet = role !== "VETERINARIAN" && target.canManageStaff;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.userId }, data: { role } });
    await tx.staffAuditLog.create({ data: { staffProfileId: id, changedById: actor.id, field: "role", oldValue: oldRole, newValue: role } });
    if (dropHeadVet) {
      await tx.staffProfile.update({ where: { id }, data: { canManageStaff: false } });
      await tx.staffAuditLog.create({ data: { staffProfileId: id, changedById: actor.id, field: "canManageStaff", oldValue: "true", newValue: "false" } });
    }
  });

  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
  return { success: true };
}
