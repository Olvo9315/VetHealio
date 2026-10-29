"use server";

import { revalidatePath } from "next/cache";
import { endOfDay, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireUserId } from "@/lib/permissions";
import { presvetMissing } from "@/lib/presvet";

export type PresvetRow = {
  prescriptionId: string;
  number: number;
  date: Date;
  status: string;
  sentAt: Date | null;
  petId: string | null;
  petName: string;
  species: string | null;
  chip: string | null;
  ownerName: string;
  ownerNif: string | null;
  vetName: string;
  vetLicense: string | null;
  medication: string;
  activeIngredient: string | null;
  nationalCode: string | null;
  route: string | null;
  treatmentDays: number | null;
  packages: number | null;
  purpose: string | null;
  exceptional: boolean;
  posology: string;
  missing: string[];
};

// Antibiotic lines prescribed in a period, with what each still lacks before it can be reported
export async function getPresvetRows(fromDay: string, toDay: string, onlyPending: boolean): Promise<{ rows: PresvetRow[]; clinicProvince: string | null }> {
  await requireUserId();
  const from = startOfDay(new Date(`${fromDay}T12:00:00`));
  const to = endOfDay(new Date(`${toDay}T12:00:00`));
  const [prescriptions, settings] = await Promise.all([
    prisma.prescription.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        presvetStatus: onlyPending ? { in: ["PENDING", "CHANGED"] } : { not: null },
      },
      include: {
        items: { where: { antibiotic: true } },
        veterinarian: { select: { name: true, staffProfile: { select: { licenseNumber: true } } } },
        pet: { select: { id: true, name: true, species: true, microchipNumber: true, owner: { select: { firstName: true, lastName: true, nif: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.clinicSettings.findUnique({ where: { id: "default" }, select: { province: true } }),
  ]);
  const clinicProvince = settings?.province ?? null;
  const rows: PresvetRow[] = prescriptions.flatMap((p) =>
    p.items.map((i) => {
      const vetLicense = p.veterinarian?.staffProfile?.licenseNumber ?? null;
      return {
        prescriptionId: p.id,
        number: p.number,
        date: p.createdAt,
        status: p.presvetStatus ?? "PENDING",
        sentAt: p.presvetSentAt,
        petId: p.pet?.id ?? null,
        petName: p.pet?.name ?? "—",
        species: p.pet?.species ?? null,
        chip: p.pet?.microchipNumber ?? null,
        ownerName: p.pet ? `${p.pet.owner.firstName} ${p.pet.owner.lastName}` : "—",
        ownerNif: p.pet?.owner.nif ?? null,
        vetName: p.veterinarian?.name ?? "—",
        vetLicense,
        medication: i.medicationName,
        activeIngredient: i.activeIngredient,
        nationalCode: i.nationalCode,
        route: i.route,
        treatmentDays: i.treatmentDays,
        packages: i.packages,
        purpose: i.purpose,
        exceptional: i.exceptional,
        posology: i.posology,
        missing: [
          ...(p.veterinarian ? [] : ["vet"]),
          ...presvetMissing(i, { vetLicense, clinicProvince, species: p.pet?.species ?? null }).filter((m) => p.veterinarian || m !== "vetLicense"),
        ],
      };
    })
  );
  return { rows, clinicProvince };
}

// For clinics that upload the file to PRESVET themselves: mark those prescriptions as reported
export async function markPresvetSent(prescriptionIds: string[], ref: string) {
  await requirePermission("prescription.write");
  await prisma.prescription.updateMany({
    where: { id: { in: prescriptionIds }, presvetStatus: { in: ["PENDING", "CHANGED"] } },
    data: { presvetStatus: "SENT", presvetSentAt: new Date(), presvetRef: ref.slice(0, 100) },
  });
  revalidatePath("/medical-records/presvet");
}
