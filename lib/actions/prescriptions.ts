"use server";

import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/permissions";

const prescriptionItemSchema = z.object({
  medicationName: z.string().min(1).max(150),
  units: z.string().max(100).optional().or(z.literal("")),
  activeIngredient: z.string().max(150).optional().or(z.literal("")),
  posology: z.string().min(1).max(200),
  indications: z.string().max(300).optional().or(z.literal("")),
  warnings: z.string().max(300).optional().or(z.literal("")),
  // PRESVET (antibiotics)
  antibiotic: z.boolean().optional(),
  nationalCode: z.string().max(20).optional().or(z.literal("")),
  route: z.string().max(30).optional().or(z.literal("")),
  treatmentDays: z.union([z.number(), z.string().max(6)]).optional(),
  packages: z.union([z.number(), z.string().max(10)]).optional(),
  purpose: z.enum(["THERAPEUTIC", "PROPHYLACTIC", "METAPHYLACTIC"]).optional().or(z.literal("")),
  exceptional: z.boolean().optional(),
});

const prescriptionSchema = z.object({
  notes: z.string().max(500).optional().or(z.literal("")),
  petId: z.string().min(1),
  veterinarianId: z.string().optional(),
  appointmentId: z.string().optional(),
  medicalRecordId: z.string().optional(),
  items: z.array(prescriptionItemSchema).min(1),
});

export type PrescriptionItemData = z.input<typeof prescriptionItemSchema>;

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
    antibiotic: boolean;
    nationalCode: string | null;
    route: string | null;
    treatmentDays: number | null;
    packages: number | null;
    purpose: string | null;
    exceptional: boolean;
  }>;
  presvetStatus: string | null;
  presvetSentAt: Date | null;
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

function itemData(item: z.infer<typeof prescriptionItemSchema>) {
  return {
    medicationName: item.medicationName,
    units: item.units || null,
    activeIngredient: item.activeIngredient || null,
    posology: item.posology,
    indications: item.indications || null,
    warnings: item.warnings || null,
    antibiotic: !!item.antibiotic,
    nationalCode: item.nationalCode?.trim() || null,
    route: item.route || null,
    treatmentDays: Math.round(Number(item.treatmentDays)) || null,
    packages: Number(item.packages) || null,
    purpose: item.purpose || null,
    exceptional: !!item.exceptional,
  };
}

// A prescription with antibiotics has to be reported; changing one already reported asks for it again
function presvetStatusFor(items: z.infer<typeof prescriptionItemSchema>[], previous: string | null) {
  if (!items.some((i) => i.antibiotic)) return null;
  return previous === "SENT" || previous === "CHANGED" ? "CHANGED" : "PENDING";
}

export async function createPrescription(data: z.input<typeof prescriptionSchema>) {
  await requirePermission("prescription.write");
  const parsed = prescriptionSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  // Written in a visit that already has its medical record: it belongs to that record
  const visitRecord =
    !parsed.data.medicalRecordId && parsed.data.appointmentId
      ? await prisma.medicalRecord.findFirst({ where: { appointmentId: parsed.data.appointmentId }, select: { id: true } })
      : null;

  const prescription = await prisma.prescription.create({
    data: {
      notes: parsed.data.notes || null,
      petId: parsed.data.petId,
      veterinarianId: parsed.data.veterinarianId || null,
      appointmentId: parsed.data.appointmentId || null,
      medicalRecordId: parsed.data.medicalRecordId || visitRecord?.id || null,
      presvetStatus: presvetStatusFor(parsed.data.items, null),
      items: { create: parsed.data.items.map(itemData) },
    },
    include: itemInclude,
  });

  revalidatePath("/patients");
  return { prescription };
}

export async function updatePrescription(id: string, data: z.input<typeof prescriptionSchema>) {
  await requirePermission("prescription.write");
  const parsed = prescriptionSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  // Delete existing items and recreate
  const before = await prisma.prescription.findUnique({ where: { id }, select: { presvetStatus: true } });
  await prisma.prescriptionItem.deleteMany({ where: { prescriptionId: id } });

  const prescription = await prisma.prescription.update({
    where: { id },
    data: {
      notes: parsed.data.notes || null,
      veterinarianId: parsed.data.veterinarianId || null,
      appointmentId: parsed.data.appointmentId || null,
      presvetStatus: presvetStatusFor(parsed.data.items, before?.presvetStatus ?? null),
      items: { create: parsed.data.items.map(itemData) },
    },
    include: itemInclude,
  });

  revalidatePath("/patients");
  return { prescription };
}

export async function deletePrescription(id: string) {
  await requirePermission("medical.delete");
  await prisma.prescription.delete({ where: { id } });
  revalidatePath("/patients");
  return { ok: true };
}

// One prescription with its patient, to open it from lists outside the patient page (PRESVET)
export async function getPrescriptionForEdit(id: string) {
  const p = await prisma.prescription.findUnique({
    where: { id },
    include: { ...itemInclude, pet: { select: { id: true, name: true } } },
  });
  if (!p) return null;
  return { prescription: p as unknown as PrescriptionFull, petId: p.pet?.id ?? p.petId ?? "", petName: p.pet?.name ?? "" };
}
