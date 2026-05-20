import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: "admin@vethealio.com" } });
  if (existing) {
    console.log("Seed already run — admin user exists");
    return;
  }

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
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
