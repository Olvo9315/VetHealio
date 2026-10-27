import { config } from "dotenv";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { databaseUrl } from "../lib/database-url";
import { LOCALES, SERVICE_CATALOG, type CatalogEntry, type Locale } from "./service-catalog";

config({ path: ".env.local" });
config({ path: ".env" });

const pool = new pg.Pool({ connectionString: databaseUrl() });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Seed clinic identity + first admin (idempotent). Configure per clinic via env:
  //   SEED_CLINIC_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_FIRST_NAME, SEED_ADMIN_LAST_NAME,
  //   SEED_ADMIN_PASSWORD (omit to generate a random one, printed once)
  //   SEED_CLINIC_LOCALE (es | ru | en): language of official data, default es
  const clinicName = process.env.SEED_CLINIC_NAME?.trim();
  const seedLocale = process.env.SEED_CLINIC_LOCALE as Locale | undefined;
  const clinic = await prisma.clinicSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...(clinicName ? { name: clinicName } : {}), ...(seedLocale ? { dataLocale: seedLocale } : {}) },
    update: { ...(clinicName ? { name: clinicName } : {}), ...(seedLocale ? { dataLocale: seedLocale } : {}) },
  });
  const dataLocale = (LOCALES as string[]).includes(clinic.dataLocale) ? (clinic.dataLocale as Locale) : "es";
  console.log(`Clinic: ${clinicName ?? "(unchanged)"}`);

  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@vethealio.com").trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(9).toString("base64url");
    const firstName = process.env.SEED_ADMIN_FIRST_NAME ?? "Admin";
    const lastName = process.env.SEED_ADMIN_LAST_NAME ?? "";
    const admin = await prisma.user.create({
      data: {
        email,
        password: await bcrypt.hash(password, 12),
        firstName,
        lastName,
        name: `${firstName} ${lastName}`.trim(),
        role: Role.ADMIN,
        language: "es",
        theme: "light",
      },
    });
    console.log(`Created admin user: ${admin.email}`);
    if (!process.env.SEED_ADMIN_PASSWORD) console.log(`Generated password: ${password}`);
  } else {
    console.log(`Admin ${email} already exists — skipping`);
  }

  // Seed the default service catalog (idempotent). SEED_RESET_SERVICES=1 first removes the
  // existing services, refusing if any are already used by appointments or invoices.
  if (process.env.SEED_RESET_SERVICES === "1") {
    const used =
      (await prisma.appointment.count({ where: { serviceId: { not: null } } })) +
      (await prisma.appointmentService.count()) +
      (await prisma.invoiceItem.count({ where: { serviceId: { not: null } } }));
    if (used > 0) throw new Error(`Cannot reset services: ${used} appointments/invoice items use them`);
    // Children first (parent relation is Restrict)
    for (let depth = 0; depth < 3; depth++) {
      await prisma.service.deleteMany({ where: { children: { none: {} } } });
    }
    console.log("Existing services removed");
  }

  const serviceCount = await prisma.service.count();
  if (serviceCount === 0) {
    let created = 0;
    const createLevel = async (entries: CatalogEntry[], parentId: string | null) => {
      for (let sortOrder = 0; sortOrder < entries.length; sortOrder++) {
        const entry = entries[sortOrder];
        // Official name in the clinic language; the other languages become translations
        const translations = Object.fromEntries(LOCALES.filter((l) => l !== dataLocale).map((l) => [l, entry.labels[l]]));
        const service = await prisma.service.create({
          data: { name: entry.labels[dataLocale], translations, color: entry.color ?? null, price: null, parentId, sortOrder },
        });
        created++;
        if (entry.children) await createLevel(entry.children, service.id);
      }
    };
    await createLevel(SERVICE_CATALOG, null);
    console.log(`Created ${created} services`);
  } else {
    console.log(`Services already seeded (${serviceCount} found)`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
