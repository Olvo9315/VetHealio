import { addDays } from "date-fns";

export type StockStatus = "OK" | "LOW" | "OUT";
export type ExpiryStatus = "OK" | "EXPIRING_SOON" | "EXPIRED" | "NONE";

export function getStockStatus(item: { quantity: number; minStock: number }): StockStatus {
  if (item.quantity === 0) return "OUT";
  if (item.minStock > 0 && item.quantity <= item.minStock) return "LOW";
  return "OK";
}

export function getExpiryStatus(expiryDate: Date | null | undefined): ExpiryStatus {
  if (!expiryDate) return "NONE";
  const now = new Date();
  const exp = new Date(expiryDate);
  if (exp < now) return "EXPIRED";
  if (exp < addDays(now, 30)) return "EXPIRING_SOON";
  return "OK";
}
