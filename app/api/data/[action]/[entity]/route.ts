import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { toCsv } from "@/lib/data-transfer/csv";
import {
  EXPORTABLE,
  INVENTORY_COLUMNS,
  PATIENT_COLUMNS,
  SERVICE_COLUMNS,
  exportBackup,
  exportCsv,
  type ExportEntity,
} from "@/lib/data-transfer/export";
import { IMPORTABLE, importCsv, type ImportEntity } from "@/lib/data-transfer/import";

// /api/data/export/<entity>   → CSV download
// /api/data/export/backup     → full JSON backup
// /api/data/template/<entity> → empty CSV with headers + example row
// POST /api/data/import/<entity>?dryRun=1 → validate (or import) an uploaded CSV

export const maxDuration = 60;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const TEMPLATES: Record<ImportEntity, { header: string[]; example: string[] }> = {
  patients: {
    header: PATIENT_COLUMNS,
    example: ["Ana", "García", "+34 600 000 001", "", "ana@example.com", "C/ Mayor 1", "46001", "Max", "DOG", "Labrador", "Negro", "MALE", "2020-05-14", "28.5", "941000000000001", "", "yes", "yes"],
  },
  inventory: {
    header: INVENTORY_COLUMNS,
    example: ["Amoxicilina 250mg", "Medicamentos", "20", "comprimidos", "5", "0.35", "2027-12-31", "Proveedor S.L.", ""],
  },
  services: {
    header: SERVICE_COLUMNS,
    example: ["Consulta", "", "35", "#15803D", "yes"],
  },
};

async function isAdmin() {
  const session = await auth();
  return (session?.user as { role?: Role } | undefined)?.role === "ADMIN";
}

function download(body: string, filename: string, type: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function GET(_req: NextRequest, { params }: { params: { action: string; entity: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { action, entity } = params;

  if (action === "export" && entity === "backup") {
    const backup = await exportBackup();
    return download(JSON.stringify(backup, null, 2), `vethealio-backup-${stamp()}.json`, "application/json");
  }
  if (action === "export" && (EXPORTABLE as readonly string[]).includes(entity)) {
    const csv = await exportCsv(entity as ExportEntity);
    return download(csv, `${entity}-${stamp()}.csv`, "text/csv; charset=utf-8");
  }
  if (action === "template" && (IMPORTABLE as readonly string[]).includes(entity)) {
    const t = TEMPLATES[entity as ImportEntity];
    return download(toCsv(t.header, [t.example]), `${entity}-template.csv`, "text/csv; charset=utf-8");
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest, { params }: { params: { action: string; entity: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { action, entity } = params;
  if (action !== "import" || !(IMPORTABLE as readonly string[]).includes(entity)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "missingFile" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "fileTooLarge" }, { status: 400 });

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const result = await importCsv(entity as ImportEntity, await file.text(), dryRun);
  return NextResponse.json(result);
}
