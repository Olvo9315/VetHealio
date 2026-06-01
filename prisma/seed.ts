import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Seed admin user (idempotent)
  const existing = await prisma.user.findUnique({ where: { email: "admin@vethealio.com" } });
  if (!existing) {
    const hashedPassword = await bcrypt.hash("admin123", 12);
    const admin = await prisma.user.create({
      data: {
        email: "admin@vethealio.com",
        password: hashedPassword,
        name: "Dr. Admin",
        role: Role.ADMIN,
        language: "es",
        theme: "light",
      },
    });
    console.log(`Created admin user: ${admin.email}`);
    console.log("Login: admin@vethealio.com / admin123");
  } else {
    console.log("Admin user already exists — skipping");
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
