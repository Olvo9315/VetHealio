// Role/permission matrix, shared by server checks and the client UI.
// "Head vet" is a VETERINARIAN whose staff profile has canManageStaff = true.

export type Role = "ADMIN" | "VETERINARIAN" | "RECEPTIONIST" | "ASSISTANT";
export type Actor = { role: Role; isHeadVet: boolean };

export const PERMISSIONS = {
  // Data that ends up on official documents: services and their prices
  "catalog.manage": ["ADMIN", "HEAD_VET"],
  // Clinic identity (NIF, address, invoice footer, language, logo), licenses, import/export
  "clinic.settings": ["ADMIN"],
  "staff.manage": ["ADMIN", "HEAD_VET"],
  // Create invoices, edit pending ones, register payments
  "invoice.write": ["ADMIN", "HEAD_VET", "VETERINARIAN", "RECEPTIONIST"],
  // Cancel or delete invoices (fiscal documents)
  "invoice.void": ["ADMIN", "HEAD_VET"],
  // Medical records and vaccinations (clinical documents)
  "medical.write": ["ADMIN", "HEAD_VET", "VETERINARIAN"],
  "medical.delete": ["ADMIN", "HEAD_VET"],
  // Prescriptions: only veterinarians may prescribe
  "prescription.write": ["ADMIN", "HEAD_VET", "VETERINARIAN"],
  // Inventory items: names, units, costs, suppliers (stock adjustments are open to all staff)
  "inventory.manage": ["ADMIN", "HEAD_VET"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor) return false;
  const allowed = PERMISSIONS[permission] as readonly string[];
  if (allowed.includes(actor.role)) return true;
  return actor.role === "VETERINARIAN" && actor.isHeadVet && allowed.includes("HEAD_VET");
}

export function grantedPermissions(actor: Actor | null | undefined): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(actor, p));
}
