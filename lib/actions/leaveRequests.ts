"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role, LeaveType, LeaveStatus } from "@prisma/client";
import { sendLeaveRequestEmail, sendLeaveReviewEmail } from "@/lib/email";

async function getSession() {
  const session = await auth();
  return session?.user as { id: string; role: Role; email?: string; name?: string } | undefined;
}

async function requireAdminOrManager() {
  const user = await getSession();
  if (!user) throw new Error("Unauthorized");
  if (user.role === "ADMIN") return user;
  if (user.role === "VETERINARIAN") {
    const profile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
    if (profile?.canManageStaff) return user;
  }
  throw new Error("Forbidden");
}

const createSchema = z.object({
  type: z.nativeEnum(LeaveType),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().max(500).optional().or(z.literal("")),
});

export async function createLeaveRequest(data: z.infer<typeof createSchema>) {
  const user = await getSession();
  if (!user) throw new Error("Unauthorized");

  const parsed = createSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const profile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return { error: { formErrors: ["Staff profile not found"], fieldErrors: {} } };

  const leave = await prisma.leaveRequest.create({
    data: {
      staffProfileId: profile.id,
      type: parsed.data.type,
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(parsed.data.endDate),
      reason: parsed.data.reason || null,
    },
  });

  // Notify all admins
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  const typeLabel = leaveTypeLabel(parsed.data.type);
  for (const admin of admins) {
    await sendLeaveRequestEmail({
      adminEmail: admin.email,
      staffName: user.name ?? user.email ?? "Empleado",
      type: typeLabel,
      startDate: formatDate(parsed.data.startDate),
      endDate: formatDate(parsed.data.endDate),
      reason: parsed.data.reason,
    }).catch(() => {});
  }

  revalidatePath("/staff");
  return { leave };
}

export async function getLeaveRequests(filters: { status?: LeaveStatus; staffProfileId?: string } = {}) {
  const user = await getSession();
  if (!user) throw new Error("Unauthorized");

  const isManager = user.role === "ADMIN" || user.role === "VETERINARIAN";
  const ownProfile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });

  const canManage = isManager && (user.role === "ADMIN" ||
    (ownProfile ? (await prisma.staffProfile.findUnique({ where: { id: ownProfile.id }, select: { canManageStaff: true } }))?.canManageStaff : false));

  return prisma.leaveRequest.findMany({
    where: {
      ...(canManage ? {} : { staffProfileId: ownProfile?.id }),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.staffProfileId ? { staffProfileId: filters.staffProfileId } : {}),
    },
    include: {
      staffProfile: { include: { user: { select: { name: true, email: true, avatar: true } } } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function reviewLeaveRequest(id: string, status: "APPROVED" | "REJECTED", reviewNote?: string) {
  const reviewer = await requireAdminOrManager();

  const leave = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: status as LeaveStatus,
      reviewedById: reviewer.id,
      reviewedAt: new Date(),
      reviewNote: reviewNote || null,
    },
    include: {
      staffProfile: { include: { user: { select: { email: true, name: true } } } },
    },
  });

  await sendLeaveReviewEmail({
    staffEmail: leave.staffProfile.user.email,
    staffName: leave.staffProfile.user.name,
    type: leaveTypeLabel(leave.type),
    status,
    reviewNote,
  }).catch(() => {});

  revalidatePath("/staff");
  return { leave };
}

function leaveTypeLabel(type: LeaveType): string {
  const map: Record<LeaveType, string> = {
    VACATION: "Vacaciones",
    UNPAID_LEAVE: "Excedencia",
    AGREEMENT: "Permiso acordado",
    SICK_LEAVE: "Baja médica",
  };
  return map[type] ?? type;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-ES");
}
