import type { PaymentMethod } from "@prisma/client";

// Payment methods in the order shown at the counter; labels are keys in the "finances" namespace
export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "CARD", label: "card" },
  { id: "CASH", label: "cash" },
  { id: "BIZUM", label: "bizum" },
  { id: "TRANSFER", label: "transfer" },
];

export const paymentLabel: Record<PaymentMethod, string> = {
  CASH: "cash",
  CARD: "card",
  TRANSFER: "transfer",
  BIZUM: "bizum",
};
