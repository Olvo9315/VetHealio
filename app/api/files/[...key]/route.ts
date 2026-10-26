import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFile } from "@/lib/storage";

async function canManageStaff(user: { id: string; role: Role }) {
  if (user.role === "ADMIN") return true;
  if (user.role !== "VETERINARIAN") return false;
  const profile = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
  return profile?.canManageStaff ?? false;
}

export async function GET(_req: NextRequest, { params }: { params: { key: string[] } }) {
  const key = params.key.join("/");
  const isPublic = key.startsWith("public/");

  if (!isPublic) {
    const session = await auth();
    const user = session?.user as { id: string; role: Role } | undefined;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (key.startsWith("staff/") && !(await canManageStaff(user))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const file = await getFile(key);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.data.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": isPublic ? "public, max-age=300" : "private, max-age=0, no-store",
    },
  });
}
