"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Species } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { getAppointmentById } from "@/lib/actions/appointments";
import { getServicesFlat } from "@/lib/actions/services";
import { servicePath } from "@/lib/service-path";

// ---- Types ----

export type MedicalRecordFull = {
  id: string;
  date: Date;
  chiefComplaint: string;
  diagnosis: string | null;
  treatment: string | null;
  weight: number | null;
  temperature: number | null;
  heartRate: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  petId: string;
  veterinarianId: string;
  appointmentId: string | null;
  appointment: { id: string; number: number; title: string; startTime: Date } | null;
  pet: {
    id: string;
    name: string;
    species: Species;
    owner: { firstName: string; lastName: string; phone: string };
  };
  veterinarian: { id: string; name: string };
  prescriptions: {
    id: string;
    medicationName: string;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    notes: string | null;
    // Prescriptions written from the prescription form (instead of inside the record) have items
    items: { id: string; medicationName: string; units: string | null; posology: string }[];
  }[];
  attachments: { id: string; fileName: string; fileUrl: string; fileType: string }[];
};

// ---- Schemas ----

const prescriptionSchema = z.object({
  medicationName: z.string().min(1),
  dosage: z.string().max(200).optional().or(z.literal("")),
  frequency: z.string().max(200).optional().or(z.literal("")),
  duration: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(200).optional().or(z.literal("")),
});

const medicalRecordSchema = z.object({
  petId: z.string().min(1),
  veterinarianId: z.string().min(1),
  date: z.string().min(1),
  chiefComplaint: z.string().min(1).max(500),
  diagnosis: z.string().max(500).optional().or(z.literal("")),
  treatment: z.string().max(500).optional().or(z.literal("")),
  weight: z.coerce.number().positive().optional().or(z.literal("")),
  temperature: z.coerce.number().positive().optional().or(z.literal("")),
  heartRate: z.coerce.number().int().positive().optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  prescriptions: z.array(prescriptionSchema).optional(),
  appointmentId: z.string().optional().or(z.literal("")),
});

export type MedicalRecordFormData = z.infer<typeof medicalRecordSchema>;

// ---- Include helper ----

const fullInclude = {
  pet: {
    select: {
      id: true,
      name: true,
      species: true,
      owner: { select: { firstName: true, lastName: true, phone: true } },
    },
  },
  veterinarian: { select: { id: true, name: true } },
  appointment: { select: { id: true, number: true, title: true, startTime: true } },
  prescriptions: { include: { items: { select: { id: true, medicationName: true, units: true, posology: true } } } },
  attachments: true,
} as const;

// Medication lines of the prescriptions written in a visit, for the record's treatment
function treatmentFromPrescriptions(prescriptions: { items: { medicationName: string; units: string | null; posology: string }[] }[]) {
  return prescriptions
    .flatMap((p) => p.items)
    .map((i) => `${i.medicationName}${i.units ? ` ${i.units}` : ""} — ${i.posology}`)
    .join("\n");
}

// Saving a record also updates the patient's current weight
async function updatePetWeight(petId: string, weight: number | null) {
  if (weight) await prisma.pet.update({ where: { id: petId }, data: { weight } });
}

// Prescriptions already written in the visit belong to its record
async function linkVisitPrescriptions(recordId: string, appointmentId: string | null | undefined) {
  if (!appointmentId) return;
  await prisma.prescription.updateMany({
    where: { appointmentId, medicalRecordId: null },
    data: { medicalRecordId: recordId },
  });
}

// ---- Queries ----

export async function getMedicalRecords(search?: string): Promise<MedicalRecordFull[]> {
  return prisma.medicalRecord.findMany({
    where: search
      ? {
          OR: [
            { pet: { name: { contains: search, mode: "insensitive" } } },
            { pet: { owner: { firstName: { contains: search, mode: "insensitive" } } } },
            { pet: { owner: { lastName: { contains: search, mode: "insensitive" } } } },
            { chiefComplaint: { contains: search, mode: "insensitive" } },
            { diagnosis: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: fullInclude,
    orderBy: { date: "desc" },
    take: 100,
  }) as unknown as MedicalRecordFull[];
}

export type MedicalRecordDraft = {
  appointmentId: string;
  appointmentNumber: number;
  petId: string;
  petName: string;
  veterinarianId: string;
  date: Date;
  chiefComplaint: string;
  treatment: string;
  notes: string;
  weight: number | null;
};

// The record of a visit: the existing one, or a draft filled in from the visit (services as the
// reason, its notes, prescriptions as the treatment, the patient's last weight)
export async function getMedicalRecordForAppointment(
  appointmentId: string
): Promise<{ record: MedicalRecordFull } | { draft: MedicalRecordDraft } | null> {
  await requirePermission("medical.write");
  const existing = await prisma.medicalRecord.findFirst({
    where: { appointmentId },
    include: fullInclude,
    orderBy: { date: "desc" },
  });
  if (existing) return { record: existing as unknown as MedicalRecordFull };

  const apt = await getAppointmentById(appointmentId);
  if (!apt) return null;
  const [catalog, pet, prescriptions] = await Promise.all([
    getServicesFlat(),
    prisma.pet.findUnique({ where: { id: apt.petId }, select: { weight: true } }),
    prisma.prescription.findMany({
      where: { appointmentId },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const services = [apt.service, ...(apt.extraServices ?? [])]
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map((x) => servicePath(catalog, x.id, x.name));

  return {
    draft: {
      appointmentId: apt.id,
      appointmentNumber: apt.number,
      petId: apt.petId,
      petName: apt.pet.name,
      veterinarianId: apt.veterinarianId,
      date: apt.startTime,
      chiefComplaint: (services.length ? services.join(", ") : apt.title).slice(0, 500),
      treatment: treatmentFromPrescriptions(prescriptions).slice(0, 500),
      notes: (apt.notes ?? "").slice(0, 1000),
      weight: pet?.weight ?? null,
    },
  };
}

// ---- Mutations ----

export async function createMedicalRecord(data: MedicalRecordFormData) {
  await requirePermission("medical.write");
  const parsed = medicalRecordSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const record = await prisma.medicalRecord.create({
    data: {
      petId: parsed.data.petId,
      veterinarianId: parsed.data.veterinarianId,
      date: new Date(parsed.data.date),
      chiefComplaint: parsed.data.chiefComplaint,
      diagnosis: parsed.data.diagnosis || null,
      treatment: parsed.data.treatment || null,
      weight: parsed.data.weight ? Number(parsed.data.weight) : null,
      temperature: parsed.data.temperature ? Number(parsed.data.temperature) : null,
      heartRate: parsed.data.heartRate ? Number(parsed.data.heartRate) : null,
      notes: parsed.data.notes || null,
      appointmentId: parsed.data.appointmentId || null,
      prescriptions: {
        create: (parsed.data.prescriptions ?? []).map((p) => ({
          medicationName: p.medicationName,
          dosage: p.dosage || null,
          frequency: p.frequency || null,
          duration: p.duration || null,
          notes: p.notes || null,
        })),
      },
    },
  });
  await linkVisitPrescriptions(record.id, record.appointmentId);
  await updatePetWeight(record.petId, record.weight);
  const full = await prisma.medicalRecord.findUniqueOrThrow({ where: { id: record.id }, include: fullInclude });

  revalidatePath("/medical-records");
  revalidatePath(`/patients/${parsed.data.petId}`);
  return { record: full as unknown as MedicalRecordFull };
}

export async function updateMedicalRecord(id: string, data: MedicalRecordFormData) {
  await requirePermission("medical.write");
  const parsed = medicalRecordSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  // Only the medications typed inside the record are rewritten; linked prescriptions stay
  await prisma.prescription.deleteMany({ where: { medicalRecordId: id, items: { none: {} } } });

  const record = await prisma.medicalRecord.update({
    where: { id },
    data: {
      petId: parsed.data.petId,
      veterinarianId: parsed.data.veterinarianId,
      date: new Date(parsed.data.date),
      chiefComplaint: parsed.data.chiefComplaint,
      diagnosis: parsed.data.diagnosis || null,
      treatment: parsed.data.treatment || null,
      weight: parsed.data.weight ? Number(parsed.data.weight) : null,
      temperature: parsed.data.temperature ? Number(parsed.data.temperature) : null,
      heartRate: parsed.data.heartRate ? Number(parsed.data.heartRate) : null,
      notes: parsed.data.notes || null,
      prescriptions: {
        create: (parsed.data.prescriptions ?? []).map((p) => ({
          medicationName: p.medicationName,
          dosage: p.dosage || null,
          frequency: p.frequency || null,
          duration: p.duration || null,
          notes: p.notes || null,
        })),
      },
    },
    include: fullInclude,
  });

  await updatePetWeight(record.petId, record.weight);

  revalidatePath("/medical-records");
  revalidatePath(`/patients/${parsed.data.petId}`);
  return { record: record as unknown as MedicalRecordFull };
}

export async function deleteMedicalRecord(id: string) {
  await requirePermission("medical.delete");
  const record = await prisma.medicalRecord.delete({ where: { id } });
  revalidatePath("/medical-records");
  revalidatePath(`/patients/${record.petId}`);
  return { success: true };
}
