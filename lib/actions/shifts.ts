"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@prisma/client";

async function requireAdminOrManager() {
  const session = await auth();
  const user = session?.user as { id: string; role: Role } | undefined;
  if (!user) throw new Error("Unauthorized");
  if (user.role === "ADMIN") return user;
  if (user.role === "VETERINARIAN") {
    const profile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
    if (profile?.canManageStaff) return user;
  }
  throw new Error("Forbidden");
}

const shiftSchema = z.object({
  userId: z.string().min(1),
  startTime: z.string(),
  endTime: z.string(),
  note: z.string().max(500).optional().or(z.literal("")),
});

export async function getShifts(from: Date, to: Date) {
  await requireAdminOrManager();
  return prisma.staffShift.findMany({
    where: { startTime: { gte: from }, endTime: { lte: to } },
    include: { user: { select: { id: true, name: true, avatar: true, role: true } } },
    orderBy: { startTime: "asc" },
  });
}

export async function getShiftsByUser(userId: string, from: Date, to: Date) {
  await requireAdminOrManager();
  return prisma.staffShift.findMany({
    where: { userId, startTime: { gte: from }, endTime: { lte: to } },
    orderBy: { startTime: "asc" },
  });
}

export async function createShift(data: z.infer<typeof shiftSchema>) {
  await requireAdminOrManager();
  const parsed = shiftSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const shift = await prisma.staffShift.create({
    data: {
      userId: parsed.data.userId,
      startTime: new Date(parsed.data.startTime),
      endTime: new Date(parsed.data.endTime),
      note: parsed.data.note || null,
    },
  });
  revalidatePath("/staff");
  return { shift };
}

export async function updateShift(id: string, data: Partial<z.infer<typeof shiftSchema>>) {
  await requireAdminOrManager();
  const shift = await prisma.staffShift.update({
    where: { id },
    data: {
      ...(data.startTime ? { startTime: new Date(data.startTime) } : {}),
      ...(data.endTime ? { endTime: new Date(data.endTime) } : {}),
      ...(data.note !== undefined ? { note: data.note || null } : {}),
    },
  });
  revalidatePath("/staff");
  return { shift };
}

export async function deleteShift(id: string) {
  await requireAdminOrManager();
  await prisma.staffShift.delete({ where: { id } });
  revalidatePath("/staff");
}
