"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppointmentStatus, AppointmentType, Species } from "@prisma/client";
import { getServiceRelationLocalizer } from "@/lib/service-i18n";
import { requireUserId } from "@/lib/permissions";

// ---- Types ----

export type AppointmentFull = {
  id: string;
  number: number;
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
  service: { id: string; name: string; officialName?: string; color: string | null } | null;
  roomId: string | null;
  room: { id: string; name: string; color: string } | null;
  pet: { id: string; name: string; species: string; owner: { firstName: string; lastName: string; phone: string } };
  veterinarian: { id: string; name: string };
};

// ---- Validation ----

const appointmentSchema = z.object({
  title: z.string().min(1).max(100),
  petId: z.string().min(1),
  veterinarianId: z.string().min(1),
  serviceId: z.string().cuid().nullable().optional().transform((v) => v ?? null),
  roomId: z.string().cuid().nullable().optional().transform((v) => v ?? null),
  type: z.nativeEnum(AppointmentType).optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  notes: z.string().max(500).optional().or(z.literal("")),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(AppointmentStatus),
});

const roomInclude = { select: { id: true, name: true, color: true } };

// Sub-services have no color of their own: the calendar uses the nearest category color
const serviceInclude = {
  select: {
    id: true,
    name: true,
    color: true,
    translations: true,
    parent: { select: { color: true, parent: { select: { color: true } } } },
  },
};

type ServiceWithParents = {
  color: string | null;
  parent?: { color: string | null; parent?: { color: string | null } | null } | null;
};

async function getAppointmentLocalizer() {
  const localize = await getServiceRelationLocalizer();
  return function <T extends { service?: unknown }>(record: T): T {
    const out = localize(record as T & { service?: { name: string } | null });
    const service = out.service as (ServiceWithParents & Record<string, unknown>) | null | undefined;
    if (!service) return out;
    const { parent, ...rest } = service;
    return { ...out, service: { ...rest, color: service.color ?? parent?.color ?? parent?.parent?.color ?? null } };
  };
}

// ---- Queries ----

export async function getAppointments(from: Date, to: Date): Promise<AppointmentFull[]> {
  const rows = (await prisma.appointment.findMany({
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
      room: roomInclude,
    },
    orderBy: { startTime: "asc" },
  })) as unknown as AppointmentFull[];
  const localize = await getAppointmentLocalizer();
  return rows.map(localize);
}

export async function getAppointmentById(id: string): Promise<AppointmentFull | null> {
  const row = (await prisma.appointment.findUnique({
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
      room: roomInclude,
    },
  })) as unknown as AppointmentFull | null;
  return row && (await getAppointmentLocalizer())(row);
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
      roomId: parsed.data.roomId ?? null,
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
      room: roomInclude,
    },
  });

  revalidatePath("/appointments");
  return { appointment: (await getAppointmentLocalizer())(appointment) };
}

// Drag & drop / resize in the calendar; in the per-room day view a drop can also move rooms
export async function updateAppointmentTime(id: string, startTime: Date, endTime: Date, roomId?: string | null) {
  // Ignore anything that is not an existing room rather than failing the whole move
  if (roomId && !(await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } }))) roomId = undefined;
  await prisma.appointment.update({
    where: { id },
    data: { startTime, endTime, ...(roomId !== undefined ? { roomId } : {}) },
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
      ...("roomId" in data ? { roomId: data.roomId ?? null } : {}),
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
      room: roomInclude,
    },
  });

  revalidatePath("/appointments");
  return { appointment: (await getAppointmentLocalizer())(appointment) };
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
  roomId: z.string().cuid().nullable().optional().transform((v) => v ?? null),
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
        roomId: parsedAppt.data.roomId ?? null,
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
        room: roomInclude,
      },
    });
  });

  revalidatePath("/appointments");
  revalidatePath("/patients");
  return { appointment: (await getAppointmentLocalizer())(appointment) };
}

export type BusySlot = { id: string; title: string; startTime: Date; endTime: Date };

// Appointments that would overlap a booking for the same vet or the same room
// (cancelled and no-show ones don't count). Used to warn before saving.
export async function checkAvailability(input: {
  startTime: string;
  endTime: string;
  veterinarianId?: string;
  roomId?: string | null;
  excludeId?: string;
}): Promise<{ vet: BusySlot[]; room: BusySlot[] }> {
  await requireUserId();
  const start = new Date(input.startTime);
  const end = new Date(input.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return { vet: [], room: [] };
  const overlapping = {
    startTime: { lt: end },
    endTime: { gt: start },
    status: { notIn: ["CANCELLED", "NO_SHOW"] as AppointmentStatus[] },
    ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
  };
  const select = { id: true, title: true, startTime: true, endTime: true };
  const [vet, room] = await Promise.all([
    input.veterinarianId
      ? prisma.appointment.findMany({ where: { ...overlapping, veterinarianId: input.veterinarianId }, select, orderBy: { startTime: "asc" } })
      : [],
    input.roomId
      ? prisma.appointment.findMany({ where: { ...overlapping, roomId: input.roomId }, select, orderBy: { startTime: "asc" } })
      : [],
  ]);
  return { vet, room };
}

export type CalendarLeave = {
  id: string;
  userId: string;
  name: string;
  type: "VACATION" | "UNPAID_LEAVE" | "AGREEMENT" | "SICK_LEAVE";
  startDate: Date;
  endDate: Date;
};

// Approved absences shown in the calendar. Only the type is exposed, never the reason.
export async function getCalendarLeaves(from: Date, to: Date): Promise<CalendarLeave[]> {
  await requireUserId();
  const leaves = await prisma.leaveRequest.findMany({
    where: { status: "APPROVED", startDate: { lte: to }, endDate: { gte: from } },
    select: {
      id: true,
      type: true,
      startDate: true,
      endDate: true,
      staffProfile: { select: { userId: true, user: { select: { name: true } } } },
    },
    orderBy: { startDate: "asc" },
  });
  return leaves.map((l) => ({
    id: l.id,
    userId: l.staffProfile.userId,
    name: l.staffProfile.user.name,
    type: l.type,
    startDate: l.startDate,
    endDate: l.endDate,
  }));
}

export type PetQuickInfo = {
  id: string;
  name: string;
  species: Species;
  breed: string | null;
  gender: "MALE" | "FEMALE" | null;
  birthDate: Date | null;
  weight: number | null;
  sterilized: boolean | null;
  microchipNumber: string | null;
  vaccinations: { vaccineName: string; dateAdministered: Date; nextDueDate: Date | null }[];
};

// Short pet summary for the hover card in the calendar / tap card on mobile
export async function getPetQuickInfo(petId: string): Promise<PetQuickInfo | null> {
  await requireUserId();
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    select: {
      id: true,
      name: true,
      species: true,
      breed: true,
      gender: true,
      birthDate: true,
      weight: true,
      sterilized: true,
      microchipNumber: true,
      vaccinations: {
        select: { vaccineName: true, dateAdministered: true, nextDueDate: true },
        orderBy: { dateAdministered: "desc" },
        take: 30,
      },
    },
  });
  if (!pet) return null;
  // Latest shot of each vaccine only
  const seen = new Set<string>();
  const vaccinations = pet.vaccinations.filter((v) => {
    const key = v.vaccineName.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...pet, gender: pet.gender as PetQuickInfo["gender"], vaccinations };
}
