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
  // Further services after the main one, in order (optional: older callers don't load them)
  extraServices?: { id: string; name: string; officialName?: string; color: string | null }[];
  roomId: string | null;
  room: { id: string; name: string; color: string } | null;
  pet: { id: string; name: string; species: string; owner: { firstName: string; lastName: string; phone: string } };
  veterinarian: { id: string; name: string };
  // A prescription of this visit still has to be reported to PRESVET
  presvetPending?: boolean;
};

// ---- Validation ----

const appointmentSchema = z.object({
  title: z.string().min(1).max(100),
  petId: z.string().min(1),
  veterinarianId: z.string().min(1),
  serviceId: z.string().cuid().nullable().optional().transform((v) => v ?? null),
  roomId: z.string().cuid().nullable().optional().transform((v) => v ?? null),
  extraServiceIds: z.array(z.string().cuid()).max(10).optional(),
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

const extraServicesInclude = {
  select: { service: serviceInclude },
  orderBy: { sortOrder: "asc" as const },
};

// Nested create for the extra services, keeping their order and dropping duplicates of the main one
function extraServicesCreate(ids: string[] | undefined, mainId: string | null | undefined) {
  const unique = Array.from(new Set((ids ?? []).filter((id) => id && id !== mainId)));
  return unique.map((serviceId, sortOrder) => ({ serviceId, sortOrder }));
}

type ServiceWithParents = {
  color: string | null;
  parent?: { color: string | null; parent?: { color: string | null } | null } | null;
};

async function getAppointmentLocalizer() {
  const localize = await getServiceRelationLocalizer();
  return function <T extends { service?: unknown }>(record: T): T {
    const out = localize(record as T & { service?: { name: string } | null });
    const service = out.service as (ServiceWithParents & Record<string, unknown>) | null | undefined;
    const extras = (out as { extraServices?: { service: unknown }[] }).extraServices;
    const result = {
      ...out,
      ...(extras ? { extraServices: extras.map((row) => flatten(localize({ service: row.service as { name: string } }).service)) } : {}),
    } as T;
    if (!service) return result;
    return { ...result, service: flatten(service) };
  };
  function flatten(service: unknown) {
    const s = service as ServiceWithParents & Record<string, unknown>;
    const { parent, ...rest } = s;
    return { ...rest, color: s.color ?? parent?.color ?? parent?.parent?.color ?? null };
  }
}

// ---- Queries ----

export async function getAppointments(from: Date, to: Date): Promise<AppointmentFull[]> {
  const rows = (await prisma.appointment.findMany({
    where: {
      startTime: { gte: from, lte: to },
    },
    include: {
      prescriptions: { where: { presvetStatus: { in: ["PENDING", "CHANGED"] } }, select: { id: true }, take: 1 },
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
      extraServices: extraServicesInclude,
      room: roomInclude,
    },
    orderBy: { startTime: "asc" },
  })) as unknown as (AppointmentFull & { prescriptions: { id: string }[] })[];
  const localize = await getAppointmentLocalizer();
  return rows.map(({ prescriptions, ...a }) => ({ ...localize(a as AppointmentFull), presvetPending: prescriptions.length > 0 }));
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
      extraServices: extraServicesInclude,
      room: roomInclude,
      prescriptions: { where: { presvetStatus: { in: ["PENDING", "CHANGED"] } }, select: { id: true }, take: 1 },
    },
  })) as unknown as (AppointmentFull & { prescriptions: { id: string }[] }) | null;
  if (!row) return null;
  const { prescriptions, ...apt } = row;
  return { ...(await getAppointmentLocalizer())(apt as AppointmentFull), presvetPending: prescriptions.length > 0 };
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
  const userId = await requireUserId();
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
      extraServices: { create: extraServicesCreate(parsed.data.extraServiceIds, parsed.data.serviceId) },
      roomId: parsed.data.roomId ?? null,
      type: parsed.data.type ?? null,
      startTime,
      endTime,
      notes: parsed.data.notes || null,
      status: AppointmentStatus.SCHEDULED,
      createdById: userId,
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
      extraServices: extraServicesInclude,
      room: roomInclude,
    },
  });

  revalidatePath("/appointments");
  return { appointment: (await getAppointmentLocalizer())(appointment) as unknown as AppointmentFull };
}

// Drag & drop / resize in the calendar; in the per-room day view a drop can also move rooms
export async function updateAppointmentTime(id: string, startTime: Date, endTime: Date, roomId?: string | null) {
  const userId = await requireUserId();
  // Ignore anything that is not an existing room rather than failing the whole move
  if (roomId && !(await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } }))) roomId = undefined;
  await prisma.appointment.update({
    where: { id },
    data: { startTime, endTime, updatedById: userId, ...(roomId !== undefined ? { roomId } : {}) },
  });
  revalidatePath("/appointments");
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  const parsed = updateStatusSchema.safeParse({ status });
  if (!parsed.success) return { error: "Invalid status" };
  const userId = await requireUserId();

  // Checking in starts the waiting time; going back to "scheduled" clears it
  const arrived = parsed.data.status === "ARRIVED";
  await prisma.appointment.update({
    where: { id },
    data: {
      status: parsed.data.status,
      updatedById: userId,
      ...(arrived ? { arrivedAt: new Date() } : parsed.data.status === "SCHEDULED" ? { arrivedAt: null } : {}),
    },
  });
  revalidatePath("/appointments");
}

export async function updateAppointment(id: string, data: Partial<z.infer<typeof appointmentSchema>>) {
  const userId = await requireUserId();
  const extraIds = "extraServiceIds" in data ? z.array(z.string().cuid()).max(10).parse(data.extraServiceIds ?? []) : undefined;
  // Main service for de-duplication: the new one if it is being changed, otherwise the stored one
  const mainId = !extraIds
    ? null
    : "serviceId" in data
      ? data.serviceId ?? null
      : (await prisma.appointment.findUnique({ where: { id }, select: { serviceId: true } }))?.serviceId ?? null;
  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      ...(data.title ? { title: data.title } : {}),
      ...(data.petId ? { petId: data.petId } : {}),
      ...(data.veterinarianId ? { veterinarianId: data.veterinarianId } : {}),
      ...("serviceId" in data ? { serviceId: data.serviceId ?? null } : {}),
      ...("roomId" in data ? { roomId: data.roomId ?? null } : {}),
      ...(extraIds ? { extraServices: { deleteMany: {}, create: extraServicesCreate(extraIds, mainId) } } : {}),
      ...(data.type ? { type: data.type } : {}),
      ...(data.startTime ? { startTime: new Date(data.startTime) } : {}),
      ...(data.endTime ? { endTime: new Date(data.endTime) } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      updatedById: userId,
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
      extraServices: extraServicesInclude,
      room: roomInclude,
    },
  });

  revalidatePath("/appointments");
  return { appointment: (await getAppointmentLocalizer())(appointment) as unknown as AppointmentFull };
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
  extraServiceIds: z.array(z.string().cuid()).max(10).optional(),
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

  const userId = await requireUserId();
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
        extraServices: { create: extraServicesCreate(parsedAppt.data.extraServiceIds, parsedAppt.data.serviceId) },
        roomId: parsedAppt.data.roomId ?? null,
        type: parsedAppt.data.type ?? null,
        startTime,
        endTime,
        notes: parsedAppt.data.notes || null,
        status: AppointmentStatus.SCHEDULED,
        createdById: userId,
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
        extraServices: extraServicesInclude,
        room: roomInclude,
      },
    });
  });

  revalidatePath("/appointments");
  revalidatePath("/patients");
  return { appointment: (await getAppointmentLocalizer())(appointment) as unknown as AppointmentFull };
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
  alerts: string | null;
  conditions: string[];
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
      alerts: true,
      conditions: true,
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

// ---- Appointment list for a date range ----

export type AppointmentListRow = {
  id: string;
  number: number;
  title: string;
  startTime: Date;
  endTime: Date;
  status: AppointmentStatus;
  arrivedAt: Date | null;
  pet: { id: string; name: string; species: Species; alerts: string | null; owner: { firstName: string; lastName: string; phone: string } };
  veterinarian: { id: string; name: string };
  services: string[];
  room: { name: string; color: string } | null;
  invoice: { id: string; status: "PENDING" | "PAID" | "CANCELLED"; totalAmount: number; paidAmount: number } | null;
  hasRecord: boolean;
  createdBy: string | null;
  updatedBy: string | null;
};

const listFilterSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  veterinarianId: z.string().optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  search: z.string().max(100).optional(),
});

// Appointments from day A to day B (both included) for the list view and its totals / export
export async function getAppointmentList(filters: z.infer<typeof listFilterSchema>): Promise<AppointmentListRow[]> {
  await requireUserId();
  const f = listFilterSchema.parse(filters);
  const from = new Date(f.from);
  const to = new Date(f.to);
  const q = f.search?.trim();
  const rows = await prisma.appointment.findMany({
    where: {
      startTime: { gte: from, lte: to },
      ...(f.veterinarianId ? { veterinarianId: f.veterinarianId } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { pet: { name: { contains: q, mode: "insensitive" as const } } },
              { pet: { owner: { firstName: { contains: q, mode: "insensitive" as const } } } },
              { pet: { owner: { lastName: { contains: q, mode: "insensitive" as const } } } },
              { pet: { owner: { phone: { contains: q } } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      number: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      arrivedAt: true,
      pet: { select: { id: true, name: true, species: true, alerts: true, owner: { select: { firstName: true, lastName: true, phone: true } } } },
      veterinarian: { select: { id: true, name: true } },
      service: { select: { name: true, translations: true } },
      extraServices: { orderBy: { sortOrder: "asc" }, select: { service: { select: { name: true, translations: true } } } },
      room: { select: { name: true, color: true } },
      invoice: { select: { id: true, status: true, totalAmount: true, paidAmount: true } },
      medicalRecords: { select: { id: true }, take: 1 },
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
    take: 2000,
  });
  const localize = await getServiceRelationLocalizer();
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    arrivedAt: r.arrivedAt,
    pet: r.pet,
    veterinarian: r.veterinarian,
    services: [r.service, ...r.extraServices.map((x) => x.service)]
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map((x) => localize({ service: x }).service!.name),
    room: r.room,
    invoice: r.invoice,
    hasRecord: r.medicalRecords.length > 0,
    createdBy: r.createdBy?.name ?? null,
    updatedBy: r.updatedBy?.name ?? null,
  }));
}
