"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@prisma/client";
import { sendCertExpiryEmail } from "@/lib/email";

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

const certSchema = z.object({
  staffProfileId: z.string().min(1),
  name: z.string().min(1).max(200),
  issuedBy: z.string().max(200).optional().or(z.literal("")),
  issuedDate: z.string().optional().or(z.literal("")),
  expiryDate: z.string().optional().or(z.literal("")),
  documentPath: z.string().optional().or(z.literal("")),
});

export async function createCertification(data: z.infer<typeof certSchema>) {
  await requireAdminOrManager();
  const parsed = certSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const cert = await prisma.staffCertification.create({
    data: {
      staffProfileId: parsed.data.staffProfileId,
      name: parsed.data.name,
      issuedBy: parsed.data.issuedBy || null,
      issuedDate: parsed.data.issuedDate ? new Date(parsed.data.issuedDate) : null,
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
      documentPath: parsed.data.documentPath || null,
    },
  });

  revalidatePath("/staff");
  return { cert };
}

export async function updateCertification(id: string, data: Partial<z.infer<typeof certSchema>>) {
  await requireAdminOrManager();
  const cert = await prisma.staffCertification.update({
    where: { id },
    data: {
      ...(data.name ? { name: data.name } : {}),
      ...(data.issuedBy !== undefined ? { issuedBy: data.issuedBy || null } : {}),
      ...(data.issuedDate !== undefined ? { issuedDate: data.issuedDate ? new Date(data.issuedDate) : null } : {}),
      ...(data.expiryDate !== undefined ? { expiryDate: data.expiryDate ? new Date(data.expiryDate) : null } : {}),
      ...(data.documentPath !== undefined ? { documentPath: data.documentPath || null } : {}),
    },
  });
  revalidatePath("/staff");
  return { cert };
}

export async function deleteCertification(id: string) {
  await requireAdminOrManager();
  await prisma.staffCertification.delete({ where: { id } });
  revalidatePath("/staff");
}

// Called when opening a staff profile — checks for certs expiring within 30 days and notifies if not yet notified
export async function checkAndNotifyCertExpiry(staffProfileId: string) {
  await requireAdminOrManager();
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const expiring = await prisma.staffCertification.findMany({
    where: {
      staffProfileId,
      expiryDate: { gte: now, lte: in30 },
      notifiedAt: null,
    },
    include: { staffProfile: { include: { user: { select: { name: true } } } } },
  });

  if (expiring.length === 0) return;

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });

  for (const cert of expiring) {
    for (const admin of admins) {
      await sendCertExpiryEmail({
        adminEmail: admin.email,
        staffName: cert.staffProfile.user.name,
        certName: cert.name,
        expiryDate: cert.expiryDate!.toLocaleDateString("es-ES"),
      }).catch(() => {});
    }
    await prisma.staffCertification.update({
      where: { id: cert.id },
      data: { notifiedAt: now },
    });
  }
}
