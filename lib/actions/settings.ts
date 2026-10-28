"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACCENT_IDS } from "@/lib/accents";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { getActor, hasPermission, requireUserId } from "@/lib/permissions";

// ---- Types ----

export type UserProfile = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  role: Role;
  language: string;
  theme: string;
  accent: string;
};

// ---- Schemas ----

const profileSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  phone: z.string().max(20).optional().or(z.literal("")),
  avatar: z.string().url().optional().or(z.literal("")),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "Mínimo 6 caracteres"),
  confirmPassword: z.string().min(6),
});

const preferencesSchema = z.object({
  language: z.enum(["es", "ru", "en"]).optional(),
  theme: z.enum(["light", "dark"]).optional(),
  accent: z.enum(ACCENT_IDS).optional(),
});

// ---- Queries ----

export async function getUserById(id: string): Promise<UserProfile | null> {
  const actor = await getActor();
  if (!actor || (actor.id !== id && !hasPermission(actor, "staff.manage"))) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      avatar: true,
      role: true,
      language: true,
      theme: true,
      accent: true,
    },
  });
  return user as UserProfile | null;
}

// ---- Mutations ----

export async function updateProfile(userId: string, data: z.infer<typeof profileSchema>) {
  // Never trust the id sent by the client
  userId = await requireUserId();
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      name: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
      phone: parsed.data.phone || null,
      avatar: parsed.data.avatar || null,
    },
    select: { id: true, name: true, firstName: true, lastName: true, email: true, phone: true, avatar: true, role: true, language: true, theme: true, accent: true },
  });

  revalidatePath("/settings");
  return { user: user as UserProfile };
}

export async function changePassword(userId: string, data: z.infer<typeof passwordSchema>) {
  // Never trust the id sent by the client
  userId = await requireUserId();
  const parsed = passwordSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { error: { fieldErrors: { confirmPassword: ["Las contraseñas no coinciden"] }, formErrors: [] } };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user) return { error: { formErrors: ["Usuario no encontrado"], fieldErrors: {} } };

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!valid) return { error: { fieldErrors: { currentPassword: ["Contraseña actual incorrecta"] }, formErrors: [] } };

  const hashed = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });

  return { success: true };
}

export async function updatePreferences(userId: string, data: z.infer<typeof preferencesSchema>) {
  // Never trust the id sent by the client
  userId = await requireUserId();
  const parsed = preferencesSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(parsed.data.language ? { language: parsed.data.language } : {}),
      ...(parsed.data.theme ? { theme: parsed.data.theme } : {}),
      ...(parsed.data.accent ? { accent: parsed.data.accent } : {}),
    },
    select: { id: true, name: true, firstName: true, lastName: true, email: true, phone: true, avatar: true, role: true, language: true, theme: true, accent: true },
  });

  revalidatePath("/settings");
  return { user: user as UserProfile };
}
