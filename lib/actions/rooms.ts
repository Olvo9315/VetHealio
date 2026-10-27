"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, requireUserId } from "@/lib/permissions";

export type Room = { id: string; name: string; color: string; sortOrder: number; isActive: boolean };

const roomSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

const select = { id: true, name: true, color: true, sortOrder: true, isActive: true } as const;

export async function getRooms(includeInactive = false): Promise<Room[]> {
  await requireUserId();
  return prisma.room.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select,
  });
}

export async function createRoom(data: z.infer<typeof roomSchema>) {
  await requirePermission("rooms.manage");
  const parsed = roomSchema.safeParse(data);
  if (!parsed.success) return { error: "invalid" as const };
  const last = await prisma.room.aggregate({ _max: { sortOrder: true } });
  const room = await prisma.room.create({
    data: { ...parsed.data, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    select,
  });
  revalidatePath("/", "layout");
  return { room };
}

export async function updateRoom(id: string, data: Partial<z.infer<typeof roomSchema>> & { isActive?: boolean }) {
  await requirePermission("rooms.manage");
  const parsed = roomSchema.partial().extend({ isActive: z.boolean().optional() }).safeParse(data);
  if (!parsed.success) return { error: "invalid" as const };
  const room = await prisma.room.update({ where: { id }, data: parsed.data, select });
  revalidatePath("/", "layout");
  return { room };
}

// Rooms already used by appointments are archived (kept for history) instead of deleted
export async function deleteRoom(id: string) {
  await requirePermission("rooms.manage");
  const used = await prisma.appointment.count({ where: { roomId: id } });
  if (used > 0) {
    await prisma.room.update({ where: { id }, data: { isActive: false } });
  } else {
    await prisma.room.delete({ where: { id } });
  }
  revalidatePath("/", "layout");
  return { archived: used > 0 };
}
