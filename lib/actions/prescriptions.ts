"use server";

import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const prescriptionItemSchema = z.object({
  medicationName: z.string().min(1).max(150),
  units: z.string().max(100).optional().or(z.literal("")),
  activeIngredient: z.string().max(150).optional().or(z.literal("")),
  posology: z.string().min(1).max(200),
  indications: z.string().max(300).optional().or(z.literal("")),
  warnings: z.string().max(300).optional().or(z.literal("")),
});

const prescriptionSchema = z.object({
  notes: z.string().max(500).optional().or(z.literal("")),
  petId: z.string().min(1),
  veterinarianId: z.string().optional(),
  appointmentId: z.string().optional(),
  medicalRecordId: z.string().optional(),
  items: z.array(prescriptionItemSchema).min(1),
});

export type PrescriptionItemData = z.infer<typeof prescriptionItemSchema>;

export type PrescriptionFull = {
  id: string;
  number: number;
  notes: string | null;
  createdAt: Date;
  petId: string | null;
  veterinarianId: string | null;
  appointmentId: string | null;
  medicalRecordId: string | null;
  veterinarian: { name: string } | null;
  appointment: { id: string; title: string; startTime: Date; number: number } | null;
  items: Array<{
    id: string;
    medicationName: string;
    units: string | null;
    activeIngredient: string | null;
    posology: string;
    indications: string | null;
    warnings: string | null;
  }>;
};

const itemInclude = {
  veterinarian: { select: { name: true } },
  appointment: { select: { id: true, title: true, startTime: true, number: true } },
  items: true,
};

export async function getPrescriptionsByPet(petId: string): Promise<PrescriptionFull[]> {
  const direct = await prisma.prescription.findMany({
    where: { petId },
    include: itemInclude,
    orderBy: { createdAt: "desc" },
  });

  const viaRecord = await prisma.prescription.findMany({
    where: { petId: null, medicalRecord: { petId } },
    include: itemInclude,
    orderBy: { createdAt: "desc" },
  });

  return [...direct, ...viaRecord] as PrescriptionFull[];
}

export async function createPrescription(data: z.infer<typeof prescriptionSchema>) {
  const parsed = prescriptionSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const prescription = await prisma.prescription.create({
    data: {
      notes: parsed.data.notes || null,
      petId: parsed.data.petId,
      veterinarianId: parsed.data.veterinarianId || null,
      appointmentId: parsed.data.appointmentId || null,
      medicalRecordId: parsed.data.medicalRecordId || null,
      items: {
        create: parsed.data.items.map((item) => ({
          medicationName: item.medicationName,
          units: item.units || null,
          activeIngredient: item.activeIngredient || null,
          posology: item.posology,
          indications: item.indications || null,
          warnings: item.warnings || null,
        })),
      },
    },
    include: itemInclude,
  });

  revalidatePath("/patients");
  return { prescription };
}

export async function updatePrescription(id: string, data: z.infer<typeof prescriptionSchema>) {
  const parsed = prescriptionSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  // Delete existing items and recreate
  await prisma.prescriptionItem.deleteMany({ where: { prescriptionId: id } });

  const prescription = await prisma.prescription.update({
    where: { id },
    data: {
      notes: parsed.data.notes || null,
      veterinarianId: parsed.data.veterinarianId || null,
      appointmentId: parsed.data.appointmentId || null,
      items: {
        create: parsed.data.items.map((item) => ({
          medicationName: item.medicationName,
          units: item.units || null,
          activeIngredient: item.activeIngredient || null,
          posology: item.posology,
          indications: item.indications || null,
          warnings: item.warnings || null,
        })),
      },
    },
    include: itemInclude,
  });

  revalidatePath("/patients");
  return { prescription };
}

export async function deletePrescription(id: string) {
  await prisma.prescription.delete({ where: { id } });
  revalidatePath("/patients");
  return { ok: true };
}
