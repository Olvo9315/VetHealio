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

export function formatInvoiceId(number: number, createdAt: Date | string): string {
  const d = new Date(createdAt);
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `F-${ym}-${String(number).padStart(4, "0")}`;
}
