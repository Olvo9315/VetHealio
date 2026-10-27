"use client";

import { createContext, useContext } from "react";
import type { Permission } from "@/lib/permissions-core";

// Permissions of the signed-in user, provided by the dashboard layout. Only hides UI —
// every server action checks permissions on its own.
const PermissionsContext = createContext<Permission[]>([]);

export function PermissionsProvider({ permissions, children }: { permissions: Permission[]; children: React.ReactNode }) {
  return <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>;
}

export function useCan(permission: Permission) {
  return useContext(PermissionsContext).includes(permission);
}
