import type { AppointmentStatus, AppointmentType } from "@prisma/client";

// Color map by type — used in calendar events and badges
export const typeConfig: Record<AppointmentType, { label: string; color: string; bg: string; border: string }> = {
  CONSULTATION: { label: "Consulta",    color: "#1D4ED8", bg: "#DBEAFE", border: "#93C5FD" },
  SURGERY:      { label: "Cirugía",     color: "#B91C1C", bg: "#FEE2E2", border: "#FCA5A5" },
  VACCINATION:  { label: "Vacunación",  color: "#15803D", bg: "#DCFCE7", border: "#86EFAC" },
  GROOMING:     { label: "Estética",    color: "#7C3AED", bg: "#EDE9FE", border: "#C4B5FD" },
  CHECKUP:      { label: "Revisión",    color: "#0F766E", bg: "#CCFBF1", border: "#5EEAD4" },
  OTHER:        { label: "Otro",        color: "#6B7280", bg: "#F3F4F6", border: "#D1D5DB" },
};

export const statusConfig: Record<AppointmentStatus, { label: string; className: string }> = {
  SCHEDULED:   { label: "Programada",  className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  IN_PROGRESS: { label: "En curso",    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  COMPLETED:   { label: "Completada",  className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  CANCELLED:   { label: "Cancelada",   className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  NO_SHOW:     { label: "No se presentó", className: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400" },
};

// Opacity modifier by status for calendar events
export function getEventStyle(type: AppointmentType, status: AppointmentStatus) {
  const cfg = typeConfig[type];
  const faded = status === "COMPLETED" || status === "CANCELLED" || status === "NO_SHOW";
  return {
    backgroundColor: cfg.bg,
    border: `1px solid ${cfg.border}`,
    borderLeftWidth: "3px",
    borderLeftColor: cfg.color,
    color: cfg.color,
    opacity: faded ? 0.55 : 1,
    borderRadius: "5px",
    padding: "2px 5px",
    fontSize: "11px",
    fontWeight: 500,
    overflow: "hidden",
    // stacked-paper depth effect
    boxShadow: `2px 2px 0 ${cfg.border}, 4px 4px 0 ${cfg.border}80`,
  };
}
