import { prisma } from "@/lib/prisma";
import { toCsv } from "./csv";

// Column names are stable English ids so files round-trip through import
// regardless of the UI language; dates are ISO (YYYY-MM-DD).
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const dateTime = (d: Date | null | undefined) => (d ? d.toISOString() : "");

export const EXPORTABLE = [
  "patients",
  "appointments",
  "medical_records",
  "vaccinations",
  "invoices",
  "inventory",
  "services",
] as const;
export type ExportEntity = (typeof EXPORTABLE)[number];

export const PATIENT_COLUMNS = [
  "owner_first_name", "owner_last_name", "owner_phone", "owner_phone2", "owner_email",
  "owner_address", "owner_postal_code", "pet_name", "species", "breed", "color", "gender",
  "birth_date", "weight", "microchip", "passport", "sterilized", "active",
];
export const INVENTORY_COLUMNS = [
  "name", "category", "quantity", "unit", "min_stock", "unit_cost", "expiry_date", "supplier", "notes",
];
export const SERVICE_COLUMNS = ["name", "parent", "price", "color", "active"];

export async function exportCsv(entity: ExportEntity): Promise<string> {
  switch (entity) {
    case "patients": {
      const pets = await prisma.pet.findMany({ include: { owner: true }, orderBy: { number: "asc" } });
      return toCsv(PATIENT_COLUMNS, pets.map((p) => [
        p.owner.firstName, p.owner.lastName, p.owner.phone, p.owner.phone2, p.owner.email,
        p.owner.address, p.owner.postalCode, p.name, p.species, p.breed, p.color, p.gender,
        day(p.birthDate), p.weight, p.microchipNumber, p.passportNumber,
        p.sterilized === null ? "" : p.sterilized ? "yes" : "no", p.isActive ? "yes" : "no",
      ]));
    }
    case "appointments": {
      const rows = await prisma.appointment.findMany({
        include: { pet: { include: { owner: true } }, veterinarian: true, service: true },
        orderBy: { startTime: "asc" },
      });
      return toCsv(
        ["number", "start", "end", "status", "title", "service", "pet_name", "owner", "owner_phone", "veterinarian", "notes"],
        rows.map((a) => [
          a.number, dateTime(a.startTime), dateTime(a.endTime), a.status, a.title, a.service?.name,
          a.pet.name, `${a.pet.owner.firstName} ${a.pet.owner.lastName}`, a.pet.owner.phone,
          a.veterinarian.name, a.notes,
        ])
      );
    }
    case "medical_records": {
      const rows = await prisma.medicalRecord.findMany({
        include: { pet: { include: { owner: true } }, veterinarian: true },
        orderBy: { date: "asc" },
      });
      return toCsv(
        ["date", "pet_name", "owner", "veterinarian", "chief_complaint", "diagnosis", "treatment", "weight", "temperature", "heart_rate", "notes"],
        rows.map((r) => [
          dateTime(r.date), r.pet.name, `${r.pet.owner.firstName} ${r.pet.owner.lastName}`, r.veterinarian.name,
          r.chiefComplaint, r.diagnosis, r.treatment, r.weight, r.temperature, r.heartRate, r.notes,
        ])
      );
    }
    case "vaccinations": {
      const rows = await prisma.vaccination.findMany({
        include: { pet: { include: { owner: true } }, veterinarian: true },
        orderBy: { dateAdministered: "asc" },
      });
      return toCsv(
        ["date_administered", "next_due_date", "vaccine", "batch", "pet_name", "owner", "owner_phone", "veterinarian", "notes"],
        rows.map((v) => [
          day(v.dateAdministered), day(v.nextDueDate), v.vaccineName, v.batchNumber, v.pet.name,
          `${v.pet.owner.firstName} ${v.pet.owner.lastName}`, v.pet.owner.phone, v.veterinarian.name, v.notes,
        ])
      );
    }
    case "invoices": {
      const rows = await prisma.invoice.findMany({
        include: { pet: { include: { owner: true } }, items: true },
        orderBy: { createdAt: "asc" },
      });
      return toCsv(
        ["number", "created_at", "status", "payment_method", "paid_at", "total", "pet_name", "owner", "items"],
        rows.map((i) => [
          i.number, dateTime(i.createdAt), i.status, i.paymentMethod, dateTime(i.paidAt), i.totalAmount.toFixed(2),
          i.pet.name, `${i.pet.owner.firstName} ${i.pet.owner.lastName}`,
          i.items.map((it) => `${it.quantity}× ${it.description} (${it.unitPrice.toFixed(2)})`).join(" | "),
        ])
      );
    }
    case "inventory": {
      const rows = await prisma.inventoryItem.findMany({ orderBy: { name: "asc" } });
      return toCsv(INVENTORY_COLUMNS, rows.map((i) => [
        i.name, i.category, i.quantity, i.unit, i.minStock, i.unitCost, day(i.expiryDate), i.supplier, i.notes,
      ]));
    }
    case "services": {
      const rows = await prisma.service.findMany({ include: { parent: true }, orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }] });
      return toCsv(SERVICE_COLUMNS, rows.map((s) => [
        s.name, s.parent?.name, s.price, s.color, s.isActive ? "yes" : "no",
      ]));
    }
  }
}

// Full logical backup of the clinic's business data (no password hashes, no file blobs)
export async function exportBackup() {
  const [clinic, users, owners, pets, appointments, medicalRecords, prescriptions, vaccinations, invoices, services, inventory] =
    await Promise.all([
      prisma.clinicSettings.findMany(),
      prisma.user.findMany({ select: { id: true, email: true, name: true, firstName: true, lastName: true, role: true, phone: true, createdAt: true } }),
      prisma.owner.findMany(),
      prisma.pet.findMany(),
      prisma.appointment.findMany(),
      prisma.medicalRecord.findMany({ include: { attachments: true } }),
      prisma.prescription.findMany({ include: { items: true } }),
      prisma.vaccination.findMany(),
      prisma.invoice.findMany({ include: { items: true } }),
      prisma.service.findMany(),
      prisma.inventoryItem.findMany(),
    ]);
  return {
    format: "vethealio-backup",
    version: process.env.NEXT_PUBLIC_APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { clinic, users, owners, pets, appointments, medicalRecords, prescriptions, vaccinations, invoices, services, inventory },
  };
}
