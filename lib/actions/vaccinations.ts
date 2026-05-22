"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const vaccinationSchema = z.object({
  petId: z.string().min(1),
  veterinarianId: z.string().min(1),
  vaccineName: z.string().min(1).max(100),
  dateAdministered: z.string().min(1),
  nextDueDate: z.string().optional().or(z.literal("")),
  batchNumber: z.string().max(50).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type VaccinationFormData = z.infer<typeof vaccinationSchema>;

export type VaccinationFull = {
  id: string;
  vaccineName: string;
  dateAdministered: Date;
  nextDueDate: Date | null;
  batchNumber: string | null;
  notes: string | null;
  petId: string;
  veterinarianId: string;
  veterinarian: { name: string };
  createdAt: Date;
};

const fullInclude = {
  veterinarian: { select: { name: true } },
} as const;

export async function createVaccination(data: VaccinationFormData) {
  const parsed = vaccinationSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const vaccination = await prisma.vaccination.create({
    data: {
      petId: parsed.data.petId,
      veterinarianId: parsed.data.veterinarianId,
      vaccineName: parsed.data.vaccineName,
      dateAdministered: new Date(parsed.data.dateAdministered),
      nextDueDate: parsed.data.nextDueDate ? new Date(parsed.data.nextDueDate) : null,
      batchNumber: parsed.data.batchNumber || null,
      notes: parsed.data.notes || null,
    },
    include: fullInclude,
  });

  revalidatePath(`/patients/${parsed.data.petId}`);
  return { vaccination: vaccination as unknown as VaccinationFull };
}

export async function updateVaccination(id: string, data: VaccinationFormData) {
  const parsed = vaccinationSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const vaccination = await prisma.vaccination.update({
    where: { id },
    data: {
      veterinarianId: parsed.data.veterinarianId,
      vaccineName: parsed.data.vaccineName,
      dateAdministered: new Date(parsed.data.dateAdministered),
      nextDueDate: parsed.data.nextDueDate ? new Date(parsed.data.nextDueDate) : null,
      batchNumber: parsed.data.batchNumber || null,
      notes: parsed.data.notes || null,
    },
    include: fullInclude,
  });

  revalidatePath(`/patients/${parsed.data.petId}`);
  return { vaccination: vaccination as unknown as VaccinationFull };
}

export async function deleteVaccination(id: string, petId: string) {
  await prisma.vaccination.delete({ where: { id } });
  revalidatePath(`/patients/${petId}`);
  return { success: true };
}
