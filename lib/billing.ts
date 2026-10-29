import { cents } from "@/lib/format";

// VAT rates used in Spain (prices are entered with VAT included)
export const TAX_RATES = [21, 10, 4, 0] as const;

export type DocLine = { description: string; quantity: number; unitPrice: number; taxRate: number; total: number };
export type TaxRow = { rate: number; base: number; tax: number };

// Base and VAT per rate from lines whose prices include VAT
export function taxBreakdown(lines: DocLine[]): { rows: TaxRow[]; base: number; tax: number; total: number } {
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.taxRate, (byRate.get(l.taxRate) ?? 0) + l.total);
  const rows = Array.from(byRate.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([rate, gross]) => {
      const base = cents(gross / (1 + rate / 100));
      return { rate, base, tax: cents(gross - base) };
    });
  const total = cents(lines.reduce((s, l) => s + l.total, 0));
  const base = cents(rows.reduce((s, r) => s + r.base, 0));
  return { rows, base, tax: cents(total - base), total };
}

// "T2026-000123"
export function docNumber(doc: { series: string; year: number; number: number }) {
  return `${doc.series}${doc.year}-${String(doc.number).padStart(6, "0")}`;
}

// Amount still owed on a bill
export function dueOf(inv: { status: string; totalAmount: number; paidAmount: number }) {
  return inv.status === "CANCELLED" ? 0 : Math.max(0, cents(inv.totalAmount - inv.paidAmount));
}
