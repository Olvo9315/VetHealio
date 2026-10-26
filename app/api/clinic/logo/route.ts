import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteFile, putFile, safeFileName } from "@/lib/storage";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
// No SVG: it can carry scripts and the logo is served publicly
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

async function requireAdmin() {
  const session = await auth();
  const user = session?.user as { role?: Role } | undefined;
  return user?.role === "ADMIN";
}

async function replaceLogo(newKey: string | null) {
  const current = await prisma.clinicSettings.findUnique({ where: { id: "default" } });
  await prisma.clinicSettings.upsert({
    where: { id: "default" },
    create: { id: "default", logoKey: newKey },
    update: { logoKey: newKey },
  });
  if (current?.logoKey && current.logoKey !== newKey) await deleteFile(current.logoKey);
  revalidatePath("/", "layout");
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 2 MB)" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  const key = `public/logo/${safeFileName(file.name)}`;
  await putFile(key, Buffer.from(await file.arrayBuffer()), file.type);
  await replaceLogo(key);
  return NextResponse.json({ key });
}

export async function DELETE() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await replaceLogo(null);
  return NextResponse.json({ success: true });
}
