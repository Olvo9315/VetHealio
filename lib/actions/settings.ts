"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

// ---- Types ----

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  role: Role;
  language: string;
  theme: string;
};

// ---- Schemas ----

const profileSchema = z.object({
  name: z.string().min(1).max(100),
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
});

// ---- Queries ----

export async function getUserById(id: string): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatar: true,
      role: true,
      language: true,
      theme: true,
    },
  });
  return user as UserProfile | null;
}

// ---- Mutations ----

export async function updateProfile(userId: string, data: z.infer<typeof profileSchema>) {
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      avatar: parsed.data.avatar || null,
    },
    select: { id: true, name: true, email: true, phone: true, avatar: true, role: true, language: true, theme: true },
  });

  revalidatePath("/settings");
  return { user: user as UserProfile };
}

export async function changePassword(userId: string, data: z.infer<typeof passwordSchema>) {
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
  const parsed = preferencesSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(parsed.data.language ? { language: parsed.data.language } : {}),
      ...(parsed.data.theme ? { theme: parsed.data.theme } : {}),
    },
    select: { id: true, name: true, email: true, phone: true, avatar: true, role: true, language: true, theme: true },
  });

  revalidatePath("/settings");
  return { user: user as UserProfile };
}
