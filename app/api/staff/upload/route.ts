import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadStaffDocument } from "@/lib/storage";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { id: string; role: Role } | undefined;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let hasAccess = user.role === "ADMIN";
  if (!hasAccess && user.role === "VETERINARIAN") {
    const profile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
    hasAccess = profile?.canManageStaff ?? false;
  }
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const staffId = formData.get("staffId") as string | null;
  const folder = (formData.get("folder") as string | null) ?? "diploma";

  if (!file || !staffId) {
    return NextResponse.json({ error: "Missing file or staffId" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = await uploadStaffDocument(
    buffer,
    file.name,
    staffId,
    folder as "diploma" | "contract" | "certification"
  );

  return NextResponse.json({ path });
}
