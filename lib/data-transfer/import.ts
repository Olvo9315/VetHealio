import { Gender, Species } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "./csv";

export const IMPORTABLE = ["patients", "inventory", "services"] as const;
export type ImportEntity = (typeof IMPORTABLE)[number];

export const MAX_IMPORT_ROWS = 5000;

// Problems are reported as codes (translated in the UI) with the 1-based data row number
export type ImportIssue = { row: number; code: string; field?: string };
export type ImportResult = {
  total: number;
  created: number;
  skipped: number;
  errors: ImportIssue[];
  duplicates: ImportIssue[];
  dryRun: boolean;
};

class RowError extends Error {
  constructor(public code: string, public field?: string) {
    super(code);
  }
}

// ---- Value parsers (accept ES / RU / EN spellings people actually type) ----

const SPECIES_ALIASES: Record<string, Species> = {
  dog: "DOG", perro: "DOG", perra: "DOG", "собака": "DOG", "пёс": "DOG", "пес": "DOG",
  cat: "CAT", gato: "CAT", gata: "CAT", "кошка": "CAT", "кот": "CAT",
  bird: "BIRD", "pájaro": "BIRD", pajaro: "BIRD", ave: "BIRD", "птица": "BIRD",
  rabbit: "RABBIT", conejo: "RABBIT", "кролик": "RABBIT",
  reptile: "REPTILE", reptil: "REPTILE", "рептилия": "REPTILE",
  other: "OTHER", otro: "OTHER", "другое": "OTHER",
};

function species(value: string): Species {
  const v = value.trim().toLowerCase();
  if (!v) throw new RowError("missingField", "species");
  const s = SPECIES_ALIASES[v] ?? (Object.values(Species) as string[]).find((x) => x.toLowerCase() === v);
  if (!s) throw new RowError("invalidValue", "species");
  return s as Species;
}

function gender(value: string): Gender | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (["male", "m", "macho", "м", "самец"].includes(v)) return "MALE";
  if (["female", "f", "hembra", "h", "ж", "самка"].includes(v)) return "FEMALE";
  throw new RowError("invalidValue", "gender");
}

function bool(value: string, field: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (["yes", "y", "true", "1", "si", "sí", "да"].includes(v)) return true;
  if (["no", "n", "false", "0", "нет"].includes(v)) return false;
  throw new RowError("invalidValue", field);
}

function num(value: string, field: string): number | null {
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new RowError("invalidNumber", field);
  return n;
}

// YYYY-MM-DD or DD/MM/YYYY (also with "-" or ".")
function date(value: string, field: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return utcDate(+m[1], +m[2], +m[3], field);
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return utcDate(+m[3], +m[2], +m[1], field);
  throw new RowError("invalidDate", field);
}

// Rejects impossible dates (31/02) instead of letting Date roll them over
function utcDate(year: number, month: number, dayOfMonth: number, field: string) {
  const d = new Date(Date.UTC(year, month - 1, dayOfMonth));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== dayOfMonth) {
    throw new RowError("invalidDate", field);
  }
  return d;
}

function required(row: Record<string, string>, field: string) {
  const v = row[field]?.trim();
  if (!v) throw new RowError("missingField", field);
  return v;
}

const optional = (row: Record<string, string>, field: string) => row[field]?.trim() || null;
const phoneKey = (phone: string) => phone.replace(/\D/g, "");

// ---- Importers ----

async function importPatients(rows: Record<string, string>[], dryRun: boolean, result: ImportResult) {
  const owners = await prisma.owner.findMany({ include: { pets: { select: { name: true } } } });
  // phone digits → owner id + known pet names (existing and created during this import)
  const byPhone = new Map(owners.map((o) => [phoneKey(o.phone), { id: o.id as string | null, pets: new Set(o.pets.map((p) => p.name.toLowerCase())) }]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const petName = required(row, "pet_name");
      const phone = required(row, "owner_phone");
      if (phoneKey(phone).length < 6) throw new RowError("invalidPhone", "owner_phone");
      const firstName = required(row, "owner_first_name");
      const lastName = optional(row, "owner_last_name") ?? "";
      const pet = {
        name: petName,
        species: species(row.species ?? ""),
        breed: optional(row, "breed"),
        color: optional(row, "color"),
        gender: gender(row.gender ?? ""),
        birthDate: date(row.birth_date ?? "", "birth_date"),
        weight: num(row.weight ?? "", "weight"),
        microchipNumber: optional(row, "microchip"),
        passportNumber: optional(row, "passport"),
        sterilized: bool(row.sterilized ?? "", "sterilized"),
        isActive: bool(row.active ?? "", "active") ?? true,
      };

      let owner = byPhone.get(phoneKey(phone));
      if (owner?.pets.has(petName.toLowerCase())) {
        result.skipped++;
        result.duplicates.push({ row: i + 1, code: "duplicatePatient" });
        continue;
      }
      if (!dryRun) {
        if (!owner?.id) {
          const created = await prisma.owner.create({
            data: {
              firstName, lastName, phone,
              phone2: optional(row, "owner_phone2"),
              email: optional(row, "owner_email"),
              address: optional(row, "owner_address"),
              postalCode: optional(row, "owner_postal_code"),
            },
          });
          owner = { id: created.id, pets: new Set() };
        }
        await prisma.pet.create({ data: { ...pet, ownerId: owner.id! } });
      } else if (!owner) {
        owner = { id: null, pets: new Set() };
      }
      owner.pets.add(petName.toLowerCase());
      byPhone.set(phoneKey(phone), owner);
      result.created++;
    } catch (e) {
      if (!(e instanceof RowError)) throw e;
      result.errors.push({ row: i + 1, code: e.code, field: e.field });
    }
  }
}

async function importInventory(rows: Record<string, string>[], dryRun: boolean, result: ImportResult) {
  const existing = new Set((await prisma.inventoryItem.findMany({ select: { name: true } })).map((i) => i.name.toLowerCase()));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name = required(row, "name");
      const data = {
        name,
        category: optional(row, "category") ?? "Otros",
        quantity: num(row.quantity ?? "", "quantity") ?? 0,
        unit: optional(row, "unit") ?? "unidades",
        minStock: num(row.min_stock ?? "", "min_stock") ?? 0,
        unitCost: num(row.unit_cost ?? "", "unit_cost"),
        expiryDate: date(row.expiry_date ?? "", "expiry_date"),
        supplier: optional(row, "supplier"),
        notes: optional(row, "notes"),
      };
      if (data.quantity < 0) throw new RowError("invalidNumber", "quantity");
      if (existing.has(name.toLowerCase())) {
        result.skipped++;
        result.duplicates.push({ row: i + 1, code: "duplicateItem" });
        continue;
      }
      if (!dryRun) await prisma.inventoryItem.create({ data });
      existing.add(name.toLowerCase());
      result.created++;
    } catch (e) {
      if (!(e instanceof RowError)) throw e;
      result.errors.push({ row: i + 1, code: e.code, field: e.field });
    }
  }
}

async function importServices(rows: Record<string, string>[], dryRun: boolean, result: ImportResult) {
  const all = await prisma.service.findMany({ select: { id: true, name: true, parentId: true } });
  const key = (name: string, parentId: string | null) => `${parentId ?? ""}::${name.toLowerCase()}`;
  const known = new Map(all.map((s) => [key(s.name, s.parentId), s.id as string]));
  const rootId = (name: string) => known.get(key(name, null));

  // Roots first so children can reference parents created in the same file
  const ordered = rows.map((row, i) => ({ row, i })).sort((a, b) => Number(!!a.row.parent) - Number(!!b.row.parent));
  for (const { row, i } of ordered) {
    try {
      const name = required(row, "name");
      const parentName = optional(row, "parent");
      let parentId: string | null = null;
      if (parentName) {
        parentId = rootId(parentName) ?? null;
        if (!parentId) throw new RowError("unknownParent", "parent");
      }
      const price = num(row.price ?? "", "price");
      const color = optional(row, "color");
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) throw new RowError("invalidValue", "color");
      if (known.has(key(name, parentId))) {
        result.skipped++;
        result.duplicates.push({ row: i + 1, code: "duplicateService" });
        continue;
      }
      const id = dryRun
        ? `dry-${i}`
        : (await prisma.service.create({ data: { name, parentId, price, color, isActive: bool(row.active ?? "", "active") ?? true } })).id;
      known.set(key(name, parentId), id);
      result.created++;
    } catch (e) {
      if (!(e instanceof RowError)) throw e;
      result.errors.push({ row: i + 1, code: e.code, field: e.field });
    }
  }
}

export async function importCsv(entity: ImportEntity, text: string, dryRun: boolean): Promise<ImportResult> {
  const { rows } = parseCsv(text);
  const result: ImportResult = { total: rows.length, created: 0, skipped: 0, errors: [], duplicates: [], dryRun };
  if (rows.length > MAX_IMPORT_ROWS) {
    result.errors.push({ row: 0, code: "tooManyRows" });
    return result;
  }
  if (entity === "patients") await importPatients(rows, dryRun, result);
  else if (entity === "inventory") await importInventory(rows, dryRun, result);
  else await importServices(rows, dryRun, result);
  result.errors.sort((a, b) => a.row - b.row);
  return result;
}
