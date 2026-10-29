"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireUserId } from "@/lib/permissions";

export type OwnerCard = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  nif: string | null;
  createdAt: Date;
  pets: { id: string; name: string; species: string }[];
};

const cardSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  phone2: true,
  email: true,
  nif: true,
  createdAt: true,
  pets: { select: { id: true, name: true, species: true }, orderBy: { name: "asc" as const } },
};

// Last 9 digits: "+34 600 000 001", "600000001" and "0034600000001" are the same phone
function phoneKey(phone: string | null) {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 6 ? d.slice(-9) : null;
}

// Lower case, no accents or extra spaces: "José  García" = "jose garcia"
function nameKey(first: string, last: string) {
  return `${first} ${last}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Owners that are probably the same person entered more than once: same phone, same e-mail,
// same NIF, or same full name. Each group is listed once.
export async function findDuplicateOwners(): Promise<OwnerCard[][]> {
  await requireUserId();
  const owners = await prisma.owner.findMany({ select: cardSelect, orderBy: { createdAt: "asc" } });
  // Union-find over the shared keys
  const parent = new Map(owners.map((o) => [o.id, o.id]));
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!));
  const union = (a: string, b: string) => parent.set(find(b), find(a));
  const seen = new Map<string, string>();
  for (const o of owners) {
    const keys = [
      ...[o.phone, o.phone2].map(phoneKey).filter(Boolean).map((k) => `p:${k}`),
      o.email ? `e:${o.email.trim().toLowerCase()}` : null,
      o.nif ? `n:${o.nif.replace(/\W/g, "").toUpperCase()}` : null,
      `m:${nameKey(o.firstName, o.lastName)}`,
    ].filter((k): k is string => !!k);
    for (const k of keys) {
      const other = seen.get(k);
      if (other) union(other, o.id);
      else seen.set(k, o.id);
    }
  }
  const groups = new Map<string, OwnerCard[]>();
  for (const o of owners) {
    const root = find(o.id);
    groups.set(root, [...(groups.get(root) ?? []), o]);
  }
  return Array.from(groups.values()).filter((g) => g.length > 1);
}

// Possible duplicates of one owner (for its own page)
export async function findDuplicatesOf(ownerId: string): Promise<OwnerCard[]> {
  const groups = await findDuplicateOwners();
  return groups.find((g) => g.some((o) => o.id === ownerId))?.filter((o) => o.id !== ownerId) ?? [];
}

export async function searchOwnerCards(query: string, excludeId?: string): Promise<OwnerCard[]> {
  await requireUserId();
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.owner.findMany({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { phone: { contains: q.replace(/\s/g, "") } },
        { email: { contains: q, mode: "insensitive" } },
        { pets: { some: { name: { contains: q, mode: "insensitive" } } } },
      ],
    },
    select: cardSelect,
    take: 8,
  });
}

// Joins a duplicate owner into the one to keep: their pets (with all history and bills) and signed
// documents move over, details the kept owner lacks are filled in from the duplicate, and the
// duplicate is removed. A different phone of the duplicate is kept as the second phone.
export async function mergeOwners(keepId: string, mergeId: string): Promise<{ ok: true; pets: number } | { error: string }> {
  await requirePermission("owners.merge");
  if (keepId === mergeId) return { error: "same" };
  const [keep, dup] = await Promise.all([
    prisma.owner.findUnique({ where: { id: keepId } }),
    prisma.owner.findUnique({ where: { id: mergeId }, include: { pets: { select: { id: true } } } }),
  ]);
  if (!keep || !dup) return { error: "notFound" };

  const samePhone = phoneKey(dup.phone) === phoneKey(keep.phone) || phoneKey(dup.phone) === phoneKey(keep.phone2);
  const notes = [keep.notes, dup.notes].filter((n) => n?.trim()).join("\n");
  await prisma.$transaction([
    prisma.pet.updateMany({ where: { ownerId: mergeId }, data: { ownerId: keepId } }),
    prisma.consent.updateMany({ where: { ownerId: mergeId }, data: { ownerId: keepId } }),
    prisma.owner.update({
      where: { id: keepId },
      data: {
        phone2: keep.phone2 || (!samePhone ? dup.phone : dup.phone2) || null,
        email: keep.email || dup.email,
        nif: keep.nif || dup.nif,
        address: keep.address || dup.address,
        postalCode: keep.postalCode || dup.postalCode,
        notes: notes ? notes.slice(0, 500) : null,
        // Communications: the stricter choice of the two wins
        marketingConsent: keep.marketingConsent && dup.marketingConsent,
        remindersConsent: keep.remindersConsent && dup.remindersConsent,
      },
    }),
    prisma.owner.delete({ where: { id: mergeId } }),
  ]);
  revalidatePath("/patients");
  revalidatePath(`/owners/${keepId}`);
  return { ok: true, pets: dup.pets.length };
}
