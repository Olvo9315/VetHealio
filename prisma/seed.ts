import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Seed clinic identity + first admin (idempotent). Configure per clinic via env:
  //   SEED_CLINIC_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_FIRST_NAME, SEED_ADMIN_LAST_NAME,
  //   SEED_ADMIN_PASSWORD (omit to generate a random one, printed once)
  const clinicName = process.env.SEED_CLINIC_NAME?.trim();
  await prisma.clinicSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...(clinicName ? { name: clinicName } : {}) },
    update: clinicName ? { name: clinicName } : {},
  });
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

  // Seed services (idempotent)
  const serviceCount = await prisma.service.count();
  if (serviceCount === 0) {
    const roots = await prisma.service.createManyAndReturn({
      data: [
        { name: "Consulta",            price: 35,   color: "#15803D", sortOrder: 0 },
        { name: "Analítica de sangre", price: 45,   color: "#1D4ED8", sortOrder: 1 },
        { name: "Ecografía",           price: 55,   color: "#0F766E", sortOrder: 2 },
        { name: "Esterilización",      price: 180,  color: "#B91C1C", sortOrder: 3 },
        { name: "Castración",          price: 150,  color: "#7C3AED", sortOrder: 4 },
        { name: "Cortar uñas",         price: 15,   color: "#D97706", sortOrder: 5 },
        { name: "Analítica de orina",  price: null, color: "#6B7280", sortOrder: 6 },
        { name: "Citología",           price: 35,   color: "#BE185D", sortOrder: 7 },
      ],
    });

    const urina = roots.find((r) => r.name === "Analítica de orina");
    if (urina) {
      await prisma.service.createMany({
        data: [
          { name: "Tira reactiva",      price: 12, parentId: urina.id, sortOrder: 0 },
          { name: "Sedimento urinario", price: 20, parentId: urina.id, sortOrder: 1 },
        ],
      });
    }

    console.log(`Created ${roots.length + 2} services`);
  } else {
    console.log(`Services already seeded (${serviceCount} found)`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
