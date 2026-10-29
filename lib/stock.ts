import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
type SaleLine = { inventoryItemId: string | null; quantity: number };

// Stock follows the bill: its product lines are taken out of stock, and editing or deleting the bill
// puts back what it had taken. Lots are used earliest expiry first; each movement records its lot.
export async function syncInvoiceStock(tx: Tx, invoiceId: string, lines: SaleLine[], userId: string | null) {
  // Undo what this bill took before
  const previous = await tx.stockMovement.findMany({ where: { invoiceId, reason: "SALE" } });
  for (const m of previous) {
    await tx.inventoryItem.update({ where: { id: m.itemId }, data: { quantity: { increment: -m.delta } } });
    if (m.lot !== null || m.expiryDate !== null) {
      const batch = await tx.inventoryBatch.findFirst({ where: { itemId: m.itemId, lot: m.lot, expiryDate: m.expiryDate } });
      if (batch) await tx.inventoryBatch.update({ where: { id: batch.id }, data: { quantity: { increment: -m.delta } } });
    }
  }
  await tx.stockMovement.deleteMany({ where: { invoiceId, reason: "SALE" } });

  // Take the current lines out
  const byItem = new Map<string, number>();
  for (const l of lines) if (l.inventoryItemId) byItem.set(l.inventoryItemId, (byItem.get(l.inventoryItemId) ?? 0) + l.quantity);
  for (const [itemId, qty] of Array.from(byItem.entries())) {
    let left = qty;
    const batches = await tx.inventoryBatch.findMany({
      where: { itemId, quantity: { gt: 0 } },
      orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    });
    for (const b of batches) {
      if (left <= 0) break;
      const take = Math.min(left, b.quantity);
      await tx.inventoryBatch.update({ where: { id: b.id }, data: { quantity: { decrement: take } } });
      await tx.stockMovement.create({
        data: { itemId, delta: -take, reason: "SALE", lot: b.lot, expiryDate: b.expiryDate, invoiceId, userId },
      });
      left -= take;
    }
    // Stock without lots (or more than the lots hold)
    if (left > 0) {
      await tx.stockMovement.create({ data: { itemId, delta: -left, reason: "SALE", invoiceId, userId } });
    }
    await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: { decrement: qty } } });
  }
}

// Supplier delivery: adds to the item and to its lot
export async function receiveStock(
  tx: Tx,
  input: {
    itemId: string;
    quantity: number;
    lot: string | null;
    expiryDate: Date | null;
    unitCost: number | null;
    supplier: string | null;
    document: string | null;
    userId: string | null;
  }
) {
  const { itemId, quantity, lot, expiryDate } = input;
  if (lot || expiryDate) {
    const batch = await tx.inventoryBatch.findFirst({ where: { itemId, lot, expiryDate } });
    if (batch) await tx.inventoryBatch.update({ where: { id: batch.id }, data: { quantity: { increment: quantity } } });
    else await tx.inventoryBatch.create({ data: { itemId, lot, expiryDate, quantity } });
  }
  await tx.stockMovement.create({
    data: {
      itemId,
      delta: quantity,
      reason: "RECEIPT",
      lot,
      expiryDate,
      unitCost: input.unitCost,
      supplier: input.supplier,
      document: input.document,
      userId: input.userId,
    },
  });
  // The item shows the nearest expiry among lots still in stock
  const next = await tx.inventoryBatch.findFirst({
    where: { itemId, quantity: { gt: 0 }, expiryDate: { not: null } },
    orderBy: { expiryDate: "asc" },
    select: { expiryDate: true },
  });
  await tx.inventoryItem.update({
    where: { id: itemId },
    data: {
      quantity: { increment: quantity },
      ...(input.unitCost != null ? { unitCost: input.unitCost } : {}),
      ...(input.supplier ? { supplier: input.supplier } : {}),
      ...(next?.expiryDate ? { expiryDate: next.expiryDate } : {}),
    },
  });
}
