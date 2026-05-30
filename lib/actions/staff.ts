"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { getSignedUrl } from "@/lib/storage";

// ---- RBAC helpers ----

async function requireAdminOrManager() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const user = session.user as { id: string; role: Role };
  if (user.role === "ADMIN") return user;
  if (user.role === "VETERINARIAN") {
    const profile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
    if (profile?.canManageStaff) return user;
  }
  throw new Error("Forbidden");
}

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { id: string; role: Role } | undefined;
  if (user?.role !== "ADMIN") throw new Error("Forbidden");
  return user;
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
  await requireAdminOrManager();
  return prisma.staffProfile.findMany({
    include: { user: { select: { id: true, name: true, email: true, role: true, avatar: true, phone: true } } },
    orderBy: { user: { name: "asc" } },
  });
}

export async function getStaffById(id: string) {
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
  const admin = await requireAdmin();
  const parsed = createStaffSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: { formErrors: ["Email already in use"], fieldErrors: {} } };

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
  const actor = await requireAdminOrManager();
  const parsed = updateProfileSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const existing = await prisma.staffProfile.findUnique({ where: { id } });
  if (!existing) return { error: { formErrors: ["Not found"], fieldErrors: {} } };

  const auditFields: Array<"salaryAmount" | "contractType"> = ["salaryAmount", "contractType"];
  const auditEntries: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

  for (const field of auditFields) {
    const oldVal = existing[field] != null ? String(existing[field]) : null;
    const newVal = parsed.data[field] != null && parsed.data[field] !== "" ? String(parsed.data[field]) : null;
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
        canManageStaff: parsed.data.canManageStaff,
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
  const actor = await requireAdmin();
  await prisma.$transaction(async (tx) => {
    await tx.staffProfile.update({ where: { id }, data: { isActive: false } });
    await tx.staffAuditLog.create({
      data: { staffProfileId: id, changedById: actor.id, field: "isActive", oldValue: "true", newValue: "false" },
    });
  });
  revalidatePath("/staff");
}

export async function reactivateStaff(id: string) {
  const actor = await requireAdmin();
  await prisma.$transaction(async (tx) => {
    await tx.staffProfile.update({ where: { id }, data: { isActive: true } });
    await tx.staffAuditLog.create({
      data: { staffProfileId: id, changedById: actor.id, field: "isActive", oldValue: "false", newValue: "true" },
    });
  });
  revalidatePath("/staff");
}

export async function getSignedDocumentUrl(path: string) {
  await requireAdminOrManager();
  return getSignedUrl(path);
}

export async function getLeaveBalance(staffProfileId: string, year: number) {
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
