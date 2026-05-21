"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Species } from "@prisma/client";

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
    dosage: string;
    frequency: string;
    duration: string;
    notes: string | null;
  }[];
  attachments: { id: string; fileName: string; fileUrl: string; fileType: string }[];
};

// ---- Schemas ----

const prescriptionSchema = z.object({
  medicationName: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  duration: z.string().min(1),
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
  prescriptions: true,
  attachments: true,
} as const;

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

// ---- Mutations ----

export async function createMedicalRecord(data: MedicalRecordFormData) {
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
      prescriptions: {
        create: (parsed.data.prescriptions ?? []).map((p) => ({
          medicationName: p.medicationName,
          dosage: p.dosage,
          frequency: p.frequency,
          duration: p.duration,
          notes: p.notes || null,
        })),
      },
    },
    include: fullInclude,
  });

  revalidatePath("/medical-records");
  revalidatePath(`/patients/${parsed.data.petId}`);
  return { record: record as unknown as MedicalRecordFull };
}

export async function updateMedicalRecord(id: string, data: MedicalRecordFormData) {
  const parsed = medicalRecordSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  await prisma.prescription.deleteMany({ where: { medicalRecordId: id } });

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
          dosage: p.dosage,
          frequency: p.frequency,
          duration: p.duration,
          notes: p.notes || null,
        })),
      },
    },
    include: fullInclude,
  });

  revalidatePath("/medical-records");
  revalidatePath(`/patients/${parsed.data.petId}`);
  return { record: record as unknown as MedicalRecordFull };
}

export async function deleteMedicalRecord(id: string) {
  const record = await prisma.medicalRecord.delete({ where: { id } });
  revalidatePath("/medical-records");
  revalidatePath(`/patients/${record.petId}`);
  return { success: true };
}
