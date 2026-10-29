// Presupuesto status as staff sees it: billed once it became an albarán, expired when its date
// passed with no answer
export type EstimateState = "PENDING" | "ACCEPTED" | "REJECTED" | "BILLED" | "EXPIRED";

export function estimateState(e: { status: string; invoiceId: string | null; validUntil: Date | string }): EstimateState {
  if (e.invoiceId) return "BILLED";
  if (e.status === "PENDING" && new Date(e.validUntil) < new Date()) return "EXPIRED";
  return e.status as EstimateState;
}

export const ESTIMATE_STATE_STYLE: Record<EstimateState, string> = {
  PENDING: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  ACCEPTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  BILLED: "bg-primary/10 text-primary",
  REJECTED: "bg-muted text-muted-foreground line-through",
  EXPIRED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
};
