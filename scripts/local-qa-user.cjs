// Local development only: creates (or resets) a QA admin in the local database and stores its
// login in .env.local (gitignored) as LOCAL_QA_EMAIL / LOCAL_QA_PASSWORD.
//   node scripts/local-qa-user.cjs
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const fs = require("node:fs");
const { randomBytes } = require("node:crypto");
const bcrypt = require("bcryptjs");

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("DATABASE_URL is not a local database; refusing.");
  process.exit(1);
}

(async () => {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const email = "qa@vethealio.test";
  const password = randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { password: hash },
    create: { email, password: hash, firstName: "QA", lastName: "Local", name: "QA Local", role: "ADMIN", language: "ru" },
  });
  let env = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
  env = env.replace(/^LOCAL_QA_(EMAIL|PASSWORD)=.*\n?/gm, "");
  if (env && !env.endsWith("\n")) env += "\n";
  env += `LOCAL_QA_EMAIL=${email}\nLOCAL_QA_PASSWORD=${password}\n`;
  fs.writeFileSync(".env.local", env);
  console.log(`QA user ready: ${email} (password in .env.local)`);
  await prisma.$disconnect();
})();
