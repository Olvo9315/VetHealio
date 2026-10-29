"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays } from "date-fns";
import { getStockStatus } from "@/lib/utils/inventoryHelpers";
import { assertModule } from "@/lib/license";
import { requirePermission, requireUserId } from "@/lib/permissions";
import { receiveStock } from "@/lib/stock";
import { cents } from "@/lib/format";
export type { StockStatus, ExpiryStatus } from "@/lib/utils/inventoryHelpers";

// ---- Types ----

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minStock: number;
  unitCost: number | null;
  expiryDate: Date | null;
  supplier: string | null;
  notes: string | null;
  barcode: string | null;
  salePrice: number | null;
  taxRate: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InventoryStats = {
  totalItems: number;
  lowStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  totalValue: number;
};

// ---- Schema ----

const inventorySchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  quantity: z.coerce.number().min(0),
  unit: z.string().min(1).max(30),
  minStock: z.coerce.number().min(0).default(0),
  unitCost: z.coerce.number().positive().optional().or(z.literal("")),
  expiryDate: z.string().optional().or(z.literal("")),
  supplier: z.string().max(100).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
  barcode: z.string().max(50).optional().or(z.literal("")),
  salePrice: z.coerce.number().positive().optional().or(z.literal("")),
  taxRate: z.coerce.number().min(0).max(30).optional().or(z.literal("")),
});

function extraFields(d: z.infer<typeof inventorySchema>) {
  return {
    barcode: d.barcode?.trim() || null,
    salePrice: d.salePrice ? Number(d.salePrice) : null,
    taxRate: d.taxRate === "" || d.taxRate === undefined ? null : Number(d.taxRate),
  };
}

export type InventoryFormData = z.infer<typeof inventorySchema>;

// ---- Queries ----

export async function getInventoryItems(filters?: {
  search?: string;
  category?: string;
  stockStatus?: "ALL" | "LOW" | "OUT" | "OK";
}): Promise<InventoryItem[]> {
  await assertModule("inventory");
  const { search, category, stockStatus } = filters ?? {};

  const items = await prisma.inventoryItem.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { category: { contains: search, mode: "insensitive" } },
              { supplier: { contains: search, mode: "insensitive" } },
              { barcode: { contains: search } },
            ],
          }
        : {}),
      ...(category && category !== "ALL" ? { category } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 200,
  }) as unknown as InventoryItem[];

  if (!stockStatus || stockStatus === "ALL") return items;
  return items.filter((item) => getStockStatus(item) === stockStatus);
}

export async function getInventoryStats(): Promise<InventoryStats> {
  await assertModule("inventory");
  const items = await prisma.inventoryItem.findMany({
    select: { quantity: true, minStock: true, unitCost: true, expiryDate: true },
  }) as unknown as InventoryItem[];

  const now = new Date();
  const in30 = addDays(now, 30);

  return {
    totalItems: items.length,
    lowStockCount: items.filter((i) => getStockStatus(i) !== "OK").length,
    expiringSoonCount: items.filter((i) => {
      if (!i.expiryDate) return false;
      const d = new Date(i.expiryDate);
      return d >= now && d <= in30;
    }).length,
    expiredCount: items.filter((i) => i.expiryDate && new Date(i.expiryDate) < now).length,
    totalValue: items.reduce((s, i) => s + (i.unitCost ?? 0) * i.quantity, 0),
  };
}

export async function getDistinctCategories(): Promise<string[]> {
  await assertModule("inventory");
  const rows = await prisma.inventoryItem.findMany({
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category);
}

// ---- Mutations ----

export async function createInventoryItem(data: InventoryFormData) {
  await requirePermission("inventory.manage");
  await assertModule("inventory");
  const parsed = inventorySchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const item = await prisma.inventoryItem.create({
    data: {
      name: parsed.data.name,
      category: parsed.data.category,
      quantity: Number(parsed.data.quantity),
      unit: parsed.data.unit,
      minStock: Number(parsed.data.minStock),
      unitCost: parsed.data.unitCost ? Number(parsed.data.unitCost) : null,
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
      supplier: parsed.data.supplier || null,
      notes: parsed.data.notes || null,
      ...extraFields(parsed.data),
    },
  });

  revalidatePath("/inventory");
  return { item: item as unknown as InventoryItem };
}

export async function updateInventoryItem(id: string, data: InventoryFormData) {
  await requirePermission("inventory.manage");
  await assertModule("inventory");
  const parsed = inventorySchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };

  const item = await prisma.inventoryItem.update({
    where: { id },
    data: {
      name: parsed.data.name,
      category: parsed.data.category,
      quantity: Number(parsed.data.quantity),
      unit: parsed.data.unit,
      minStock: Number(parsed.data.minStock),
      unitCost: parsed.data.unitCost ? Number(parsed.data.unitCost) : null,
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
      supplier: parsed.data.supplier || null,
      notes: parsed.data.notes || null,
      ...extraFields(parsed.data),
    },
  });

  revalidatePath("/inventory");
  return { item: item as unknown as InventoryItem };
}

export async function adjustStock(id: string, delta: number) {
  await assertModule("inventory");
  const current = await prisma.inventoryItem.findUnique({
    where: { id },
    select: { quantity: true },
  });
  if (!current) return { error: "Not found" };

  const newQty = Math.max(0, current.quantity + delta);
  const userId = await requireUserId();
  const [item] = await prisma.$transaction([
    prisma.inventoryItem.update({ where: { id }, data: { quantity: newQty } }),
    prisma.stockMovement.create({ data: { itemId: id, delta: newQty - current.quantity, reason: "ADJUST", userId } }),
  ]);

  revalidatePath("/inventory");
  return { item: item as unknown as InventoryItem };
}

export async function deleteInventoryItem(id: string) {
  await requirePermission("inventory.manage");
  await assertModule("inventory");
  await prisma.inventoryItem.delete({ where: { id } });
  revalidatePath("/inventory");
  return { success: true };
}

// ---- Search and deliveries ----

export type StockMatch = {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  unitCost: number | null;
  salePrice: number | null;
  taxRate: number | null;
  supplier: string | null;
  barcode: string | null;
};

// Autocomplete by name or barcode / national code, for deliveries and for selling products
export async function searchStockItems(query: string): Promise<StockMatch[]> {
  await requireUserId();
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.inventoryItem.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q } },
        ...q.split(/\s+/).length > 1 ? [{ AND: q.split(/\s+/).map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) }] : [],
      ],
    },
    select: { id: true, name: true, category: true, unit: true, quantity: true, unitCost: true, salePrice: true, taxRate: true, supplier: true, barcode: true },
    orderBy: { name: "asc" },
    take: 8,
  });
}

export async function getSuppliers(): Promise<string[]> {
  await requireUserId();
  const rows = await prisma.inventoryItem.findMany({
    where: { supplier: { not: null } },
    select: { supplier: true },
    distinct: ["supplier"],
    orderBy: { supplier: "asc" },
  });
  return rows.map((r) => r.supplier!).filter(Boolean);
}

const deliveryLineSchema = z.object({
  itemId: z.string().cuid().nullable().optional(),
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  unit: z.string().min(1).max(30),
  quantity: z.coerce.number().positive(),
  lot: z.string().max(50).optional().or(z.literal("")),
  expiryDate: z.string().optional().or(z.literal("")),
  unitCost: z.coerce.number().min(0).optional().or(z.literal("")),
  salePrice: z.coerce.number().min(0).optional().or(z.literal("")),
  taxRate: z.coerce.number().min(0).max(30).optional().or(z.literal("")),
  barcode: z.string().max(50).optional().or(z.literal("")),
});

const deliverySchema = z.object({
  supplier: z.string().max(100).optional().or(z.literal("")),
  document: z.string().max(60).optional().or(z.literal("")),
  lines: z.array(deliveryLineSchema).min(1).max(200),
});

export type DeliveryInput = z.input<typeof deliverySchema>;

// A supplier delivery with many lines at once: known products get their stock (and lot) added,
// new ones are created on the way
export async function receiveDelivery(data: DeliveryInput): Promise<{ received: number; created: number } | { error: string }> {
  await assertModule("inventory");
  const userId = await requireUserId();
  const parsed = deliverySchema.safeParse(data);
  if (!parsed.success) return { error: "invalid" };
  const { supplier, document, lines } = parsed.data;
  let created = 0;
  await prisma.$transaction(async (tx) => {
    for (const l of lines) {
      let itemId = l.itemId ?? null;
      if (itemId && !(await tx.inventoryItem.findUnique({ where: { id: itemId }, select: { id: true } }))) itemId = null;
      if (!itemId) {
        const same = await tx.inventoryItem.findFirst({ where: { name: { equals: l.name.trim(), mode: "insensitive" } }, select: { id: true } });
        itemId = same?.id ?? null;
      }
      if (!itemId) {
        const item = await tx.inventoryItem.create({
          data: {
            name: l.name.trim(),
            category: l.category,
            unit: l.unit,
            quantity: 0,
            barcode: l.barcode || null,
            // An empty price arrives as 0 (coerced): it means "not set"
            salePrice: l.salePrice ? Number(l.salePrice) : null,
            taxRate: l.taxRate === "" || l.taxRate === undefined ? null : Number(l.taxRate),
          },
        });
        itemId = item.id;
        created++;
      } else if (l.salePrice || l.barcode || (l.taxRate !== "" && l.taxRate !== undefined)) {
        await tx.inventoryItem.update({
          where: { id: itemId },
          data: {
            ...(l.salePrice ? { salePrice: Number(l.salePrice) } : {}),
            ...(l.barcode ? { barcode: l.barcode } : {}),
            ...(l.taxRate !== "" && l.taxRate !== undefined ? { taxRate: Number(l.taxRate) } : {}),
          },
        });
      }
      await receiveStock(tx, {
        itemId,
        quantity: l.quantity,
        lot: l.lot?.trim() || null,
        expiryDate: l.expiryDate ? new Date(l.expiryDate) : null,
        unitCost: l.unitCost ? cents(Number(l.unitCost)) : null,
        supplier: supplier?.trim() || null,
        document: document?.trim() || null,
        userId,
      });
    }
  });
  revalidatePath("/inventory");
  return { received: lines.length, created };
}

export type StockMovementRow = {
  id: string;
  delta: number;
  reason: string;
  lot: string | null;
  expiryDate: Date | null;
  unitCost: number | null;
  supplier: string | null;
  document: string | null;
  createdAt: Date;
  user: string | null;
  invoiceNumber: number | null;
};

// Lots in stock and the latest movements of an item (traceability)
export async function getItemTrace(itemId: string) {
  await requireUserId();
  const [batches, movements] = await Promise.all([
    prisma.inventoryBatch.findMany({
      where: { itemId, quantity: { gt: 0 } },
      orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }],
      select: { id: true, lot: true, expiryDate: true, quantity: true },
    }),
    prisma.stockMovement.findMany({
      where: { itemId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, delta: true, reason: true, lot: true, expiryDate: true, unitCost: true, supplier: true, document: true, createdAt: true,
        user: { select: { name: true } },
        invoice: { select: { number: true } },
      },
    }),
  ]);
  return {
    batches,
    movements: movements.map((m) => ({ ...m, user: m.user?.name ?? null, invoiceNumber: m.invoice?.number ?? null })) as StockMovementRow[],
  };
}
