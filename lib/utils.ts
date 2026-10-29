import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPetId(number: number): string {
  return `P-${String(number).padStart(4, "0")}`;
}

export function formatAppointmentId(number: number): string {
  return `C-${String(number).padStart(4, "0")}`;
}

export function formatPrescriptionId(number: number): string {
  return `Rx-${String(number).padStart(4, "0")}`;
}

// The clinic's internal bill (cuenta), not a tax document: "CU-", so it is never mistaken for a
// factura / ticket, whose numbers come from lib/billing (T2026-000001, F2026-…, R2026-…)
export function formatInvoiceId(number: number, createdAt: Date | string): string {
  const d = new Date(createdAt);
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `CU-${ym}-${String(number).padStart(4, "0")}`;
}
