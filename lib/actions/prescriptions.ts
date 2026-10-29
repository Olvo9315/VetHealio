"use server";

import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission, requireUserId } from "@/lib/permissions";

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

// Everything the printed prescription needs: prescriber, owner, animal and medicines
export async function loadPrescriptionDoc(id: string) {
  await requireUserId();
  return prisma.prescription.findUnique({
    where: { id },
    include: {
      items: true,
      veterinarian: { select: { name: true, staffProfile: { select: { licenseNumber: true } } } },
      pet: {
        select: {
          name: true,
          species: true,
          breed: true,
          microchipNumber: true,
          owner: { select: { firstName: true, lastName: true, nif: true, address: true, postalCode: true, phone: true } },
        },
      },
    },
  });
}

// Prescriptions shown inside a medical record: those already linked to it and those written in
// the same visit (they get linked when the record is saved)
export async function getRecordPrescriptions(input: { medicalRecordId?: string; appointmentId?: string }): Promise<PrescriptionFull[]> {
  const or = [
    ...(input.medicalRecordId ? [{ medicalRecordId: input.medicalRecordId }] : []),
    ...(input.appointmentId ? [{ appointmentId: input.appointmentId }] : []),
  ];
  if (!or.length) return [];
  const rows = await prisma.prescription.findMany({
    where: { OR: or, items: { some: {} } },
    include: itemInclude,
    orderBy: { createdAt: "asc" },
  });
  return rows as unknown as PrescriptionFull[];
}

export type MedicationSuggestion = {
  name: string;
  activeIngredient: string | null;
  units: string | null;
  posology: string | null;
  nationalCode: string | null;
  route: string | null;
  antibiotic: boolean;
  source: "history" | "stock";
};

// Suggestions while typing a medicine: what this clinic prescribed before (with the last dose
// written) and what it has in stock
export async function searchMedications(query: string): Promise<MedicationSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const [past, stock] = await Promise.all([
    prisma.prescriptionItem.findMany({
      where: { OR: [{ medicationName: { contains: q, mode: "insensitive" } }, { activeIngredient: { contains: q, mode: "insensitive" } }] },
      orderBy: { prescription: { createdAt: "desc" } },
      take: 40,
      select: { medicationName: true, activeIngredient: true, units: true, posology: true, nationalCode: true, route: true, antibiotic: true },
    }),
    prisma.inventoryItem.findMany({
      where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { barcode: { contains: q } }] },
      take: 8,
      select: { name: true, barcode: true, unit: true },
    }),
  ]);
  const seen = new Set<string>();
  const out: MedicationSuggestion[] = [];
  for (const p of past) {
    const key = p.medicationName.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: p.medicationName, activeIngredient: p.activeIngredient, units: p.units, posology: p.posology, nationalCode: p.nationalCode, route: p.route, antibiotic: p.antibiotic, source: "history" });
  }
  for (const s of stock) {
    const key = s.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: s.name, activeIngredient: null, units: null, posology: null, nationalCode: s.barcode, route: null, antibiotic: false, source: "stock" });
  }
  return out.slice(0, 8);
}
