"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { id: string; role: Role } | undefined;
  if (user?.role !== "ADMIN") throw new Error("Forbidden");
  return user;
}

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

const reviewSchema = z.object({
  staffProfileId: z.string().min(1),
  period: z.string().min(1).max(20),
  score: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional().or(z.literal("")),
});

export async function createPerformanceReview(data: z.infer<typeof reviewSchema>) {
  const admin = await requireAdmin();
  const parsed = reviewSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const review = await prisma.performanceReview.create({
    data: {
      staffProfileId: parsed.data.staffProfileId,
      reviewerId: admin.id,
      period: parsed.data.period,
      score: parsed.data.score ?? null,
      comment: parsed.data.comment || null,
    },
  });

  revalidatePath("/staff");
  return { review };
}

export async function updatePerformanceReview(id: string, data: Partial<z.infer<typeof reviewSchema>>) {
  await requireAdmin();
  const review = await prisma.performanceReview.update({
    where: { id },
    data: {
      ...(data.period ? { period: data.period } : {}),
      ...(data.score !== undefined ? { score: data.score ?? null } : {}),
      ...(data.comment !== undefined ? { comment: data.comment || null } : {}),
    },
  });
  revalidatePath("/staff");
  return { review };
}

export async function deletePerformanceReview(id: string) {
  await requireAdmin();
  await prisma.performanceReview.delete({ where: { id } });
  revalidatePath("/staff");
}

export async function getPerformanceReviews(staffProfileId: string) {
  await requireAdminOrManager();
  return prisma.performanceReview.findMany({
    where: { staffProfileId },
    include: { reviewer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}
