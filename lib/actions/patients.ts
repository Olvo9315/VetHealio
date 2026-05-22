"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PetFilters, PetWithOwner, PetFull } from "@/lib/types";
import { Species, Gender } from "@prisma/client";

// ---- Validation schemas ----

const ownerSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

const petSchema = z.object({
  name: z.string().min(1).max(50),
  species: z.nativeEnum(Species),
  breed: z.string().max(50).optional().or(z.literal("")),
  color: z.string().max(50).optional().or(z.literal("")),
  birthDate: z.string().optional().or(z.literal("")),
  weight: z.coerce.number().positive().optional().or(z.literal("")),
  gender: z.nativeEnum(Gender).optional().or(z.literal("")),
  microchipNumber: z.string().max(30).optional().or(z.literal("")),
  ownerId: z.string().min(1),
});

const petUpdateSchema = petSchema.partial().extend({ isActive: z.boolean().optional() });

// ---- Owner actions ----

export async function searchOwners(query: string) {
  if (!query || query.length < 2) return [];
  return prisma.owner.findMany({
    where: {
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { phone: { contains: query } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: { lastName: "asc" },
  });
}

export async function createOwner(data: z.infer<typeof ownerSchema>) {
  const parsed = ownerSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const owner = await prisma.owner.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    },
  });
  return { owner };
}

// ---- Pet actions ----

export async function getPets(filters: PetFilters = {}): Promise<PetWithOwner[]> {
  const { search, species, isActive } = filters;

  return prisma.pet.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { breed: { contains: search, mode: "insensitive" } },
              { microchipNumber: { contains: search, mode: "insensitive" } },
              { owner: { firstName: { contains: search, mode: "insensitive" } } },
              { owner: { lastName: { contains: search, mode: "insensitive" } } },
              { owner: { phone: { contains: search } } },
            ],
          }
        : {}),
      ...(species && species !== "ALL" ? { species } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    },
    include: {
      owner: true,
      appointments: {
        select: { startTime: true },
        orderBy: { startTime: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function getPetById(id: string): Promise<PetFull | null> {
  return prisma.pet.findUnique({
    where: { id },
    include: {
      owner: true,
      medicalRecords: {
        include: {
          veterinarian: { select: { name: true } },
          prescriptions: true,
        },
        orderBy: { date: "desc" },
        take: 20,
      },
      vaccinations: {
        include: { veterinarian: { select: { name: true } } },
        orderBy: { dateAdministered: "desc" },
      },
      appointments: {
        include: {
          veterinarian: { select: { name: true } },
          invoice: { select: { totalAmount: true, status: true } },
        },
        orderBy: { startTime: "desc" },
        take: 20,
      },
      invoices: {
        include: {
          appointment: { select: { title: true, startTime: true } },
          items: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  }) as unknown as PetFull | null;
}

export async function createPet(data: z.infer<typeof petSchema>) {
  const parsed = petSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const pet = await prisma.pet.create({
    data: {
      name: parsed.data.name,
      species: parsed.data.species,
      breed: parsed.data.breed || null,
      color: parsed.data.color || null,
      birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
      weight: parsed.data.weight ? Number(parsed.data.weight) : null,
      gender: parsed.data.gender || null,
      microchipNumber: parsed.data.microchipNumber || null,
      ownerId: parsed.data.ownerId,
    },
    include: { owner: true },
  });

  revalidatePath("/patients");
  return { pet };
}

export async function updatePet(id: string, data: z.infer<typeof petUpdateSchema>) {
  const parsed = petUpdateSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const pet = await prisma.pet.update({
    where: { id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.species ? { species: parsed.data.species } : {}),
      ...(parsed.data.breed !== undefined ? { breed: parsed.data.breed || null } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color || null } : {}),
      ...(parsed.data.birthDate !== undefined
        ? { birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null }
        : {}),
      ...(parsed.data.weight !== undefined
        ? { weight: parsed.data.weight ? Number(parsed.data.weight) : null }
        : {}),
      ...(parsed.data.gender !== undefined ? { gender: parsed.data.gender || null } : {}),
      ...(parsed.data.microchipNumber !== undefined
        ? { microchipNumber: parsed.data.microchipNumber || null }
        : {}),
      ...(typeof parsed.data.isActive === "boolean" ? { isActive: parsed.data.isActive } : {}),
    },
    include: { owner: true },
  });

  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  return { pet };
}

export async function archivePet(id: string) {
  await prisma.pet.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/patients");
}
