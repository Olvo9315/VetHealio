"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppointmentStatus, AppointmentType, Species } from "@prisma/client";

// ---- Types ----

export type AppointmentFull = {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  status: AppointmentStatus;
  type: AppointmentType | null;
  notes: string | null;
  googleEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
  petId: string;
  veterinarianId: string;
  serviceId: string | null;
  service: { id: string; name: string; color: string | null } | null;
  pet: { id: string; name: string; species: string; owner: { firstName: string; lastName: string; phone: string } };
  veterinarian: { id: string; name: string };
};

// ---- Validation ----

const appointmentSchema = z.object({
  title: z.string().min(1).max(100),
  petId: z.string().min(1),
  veterinarianId: z.string().min(1),
  serviceId: z.string().cuid().nullable().optional().transform((v) => v ?? null),
  type: z.nativeEnum(AppointmentType).optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  notes: z.string().max(500).optional().or(z.literal("")),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(AppointmentStatus),
});

const serviceInclude = {
  select: { id: true, name: true, color: true },
};

// ---- Queries ----

export async function getAppointments(from: Date, to: Date): Promise<AppointmentFull[]> {
  return prisma.appointment.findMany({
    where: {
      startTime: { gte: from, lte: to },
    },
    include: {
      pet: {
        select: {
          id: true,
          name: true,
          species: true,
          owner: { select: { firstName: true, lastName: true, phone: true } },
        },
      },
      veterinarian: { select: { id: true, name: true } },
      service: serviceInclude,
    },
    orderBy: { startTime: "asc" },
  }) as unknown as AppointmentFull[];
}

export async function getAppointmentById(id: string): Promise<AppointmentFull | null> {
  return prisma.appointment.findUnique({
    where: { id },
    include: {
      pet: {
        select: {
          id: true,
          name: true,
          species: true,
          owner: { select: { firstName: true, lastName: true, phone: true } },
        },
      },
      veterinarian: { select: { id: true, name: true } },
      service: serviceInclude,
    },
  }) as unknown as AppointmentFull | null;
}

export async function getVeterinarians() {
  return prisma.user.findMany({
    where: { role: { in: ["ADMIN", "VETERINARIAN"] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

export async function searchPetsForAppointment(query: string) {
  if (!query || query.length < 2) return [];
  return prisma.pet.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { breed: { contains: query, mode: "insensitive" } },
        { owner: { firstName: { contains: query, mode: "insensitive" } } },
        { owner: { lastName: { contains: query, mode: "insensitive" } } },
        { owner: { phone: { contains: query } } },
      ],
    },
    select: {
      id: true,
      name: true,
      species: true,
      owner: { select: { firstName: true, lastName: true, phone: true } },
    },
    take: 10,
    orderBy: { name: "asc" },
  });
}

// ---- Mutations ----

export async function createAppointment(data: z.infer<typeof appointmentSchema>) {
  const parsed = appointmentSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const startTime = new Date(parsed.data.startTime);
  const endTime = new Date(parsed.data.endTime);

  if (endTime <= startTime) {
    return { error: { fieldErrors: { endTime: ["Debe ser posterior al inicio"] }, formErrors: [] } };
  }

  const appointment = await prisma.appointment.create({
    data: {
      title: parsed.data.title,
      petId: parsed.data.petId,
      veterinarianId: parsed.data.veterinarianId,
      serviceId: parsed.data.serviceId ?? null,
      type: parsed.data.type ?? null,
      startTime,
      endTime,
      notes: parsed.data.notes || null,
      status: AppointmentStatus.SCHEDULED,
    },
    include: {
      pet: {
        select: {
          id: true, name: true, species: true,
          owner: { select: { firstName: true, lastName: true, phone: true } },
        },
      },
      veterinarian: { select: { id: true, name: true } },
      service: serviceInclude,
    },
  });

  revalidatePath("/appointments");
  return { appointment };
}

export async function updateAppointmentTime(id: string, startTime: Date, endTime: Date) {
  await prisma.appointment.update({
    where: { id },
    data: { startTime, endTime },
  });
  revalidatePath("/appointments");
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  const parsed = updateStatusSchema.safeParse({ status });
  if (!parsed.success) return { error: "Invalid status" };

  await prisma.appointment.update({
    where: { id },
    data: { status: parsed.data.status },
  });
  revalidatePath("/appointments");
}

export async function updateAppointment(id: string, data: Partial<z.infer<typeof appointmentSchema>>) {
  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      ...(data.title ? { title: data.title } : {}),
      ...(data.petId ? { petId: data.petId } : {}),
      ...(data.veterinarianId ? { veterinarianId: data.veterinarianId } : {}),
      ...("serviceId" in data ? { serviceId: data.serviceId ?? null } : {}),
      ...(data.type ? { type: data.type } : {}),
      ...(data.startTime ? { startTime: new Date(data.startTime) } : {}),
      ...(data.endTime ? { endTime: new Date(data.endTime) } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
    },
    include: {
      pet: {
        select: {
          id: true, name: true, species: true,
          owner: { select: { firstName: true, lastName: true, phone: true } },
        },
      },
      veterinarian: { select: { id: true, name: true } },
      service: serviceInclude,
    },
  });

  revalidatePath("/appointments");
  return { appointment };
}

export async function deleteAppointment(id: string) {
  await prisma.appointment.delete({ where: { id } });
  revalidatePath("/appointments");
}

// ---- Primary visit: create owner+pet+appointment in one transaction ----

const primaryPatientSchema = z.object({
  petName: z.string().min(1).max(50),
  petSpecies: z.nativeEnum(Species),
  ownerFirstName: z.string().min(1).max(50),
  ownerLastName: z.string().min(1).max(50),
  ownerPhone: z.string().min(7).max(20),
  existingOwnerId: z.string().optional(),
  existingPetId: z.string().optional(),
});

const appointmentBaseSchema = z.object({
  title: z.string().min(1).max(100),
  veterinarianId: z.string().min(1),
  serviceId: z.string().cuid().nullable().optional().transform((v) => v ?? null),
  type: z.nativeEnum(AppointmentType).optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export async function createAppointmentWithNewPatient(
  apptData: z.infer<typeof appointmentBaseSchema>,
  primary: z.infer<typeof primaryPatientSchema>
) {
  const parsedAppt = appointmentBaseSchema.safeParse(apptData);
  if (!parsedAppt.success) return { error: parsedAppt.error.flatten() };

  const parsedPrimary = primaryPatientSchema.safeParse(primary);
  if (!parsedPrimary.success) return { error: parsedPrimary.error.flatten() };

  const startTime = new Date(parsedAppt.data.startTime);
  const endTime = new Date(parsedAppt.data.endTime);
  if (endTime <= startTime) {
    return { error: { fieldErrors: { endTime: ["Debe ser posterior al inicio"] }, formErrors: [] } };
  }

  const { petName, petSpecies, ownerFirstName, ownerLastName, ownerPhone, existingOwnerId, existingPetId } = parsedPrimary.data;

  const appointment = await prisma.$transaction(async (tx) => {
    let resolvedPetId: string;

    if (existingPetId) {
      resolvedPetId = existingPetId;
    } else if (existingOwnerId) {
      const pet = await tx.pet.create({
        data: { name: petName, species: petSpecies, ownerId: existingOwnerId },
      });
      resolvedPetId = pet.id;
    } else {
      const owner = await tx.owner.create({
        data: { firstName: ownerFirstName, lastName: ownerLastName, phone: ownerPhone },
      });
      const pet = await tx.pet.create({
        data: { name: petName, species: petSpecies, ownerId: owner.id },
      });
      resolvedPetId = pet.id;
    }

    return tx.appointment.create({
      data: {
        title: parsedAppt.data.title,
        petId: resolvedPetId,
        veterinarianId: parsedAppt.data.veterinarianId,
        serviceId: parsedAppt.data.serviceId ?? null,
        type: parsedAppt.data.type ?? null,
        startTime,
        endTime,
        notes: parsedAppt.data.notes || null,
        status: AppointmentStatus.SCHEDULED,
      },
      include: {
        pet: {
          select: {
            id: true, name: true, species: true,
            owner: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
        veterinarian: { select: { id: true, name: true } },
        service: serviceInclude,
      },
    });
  });

  revalidatePath("/appointments");
  revalidatePath("/patients");
  return { appointment };
}
