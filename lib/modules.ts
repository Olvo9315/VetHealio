// Feature modules. "core" ones are always on; the rest are enabled per clinic by a
// signed license (lib/license.ts). Labels live in the "modules" i18n namespace.

export type ModuleKey = "inventory" | "staff" | "smsReminders" | "presvet" | "knowledgeBase";

export type ModuleDef = {
  key: ModuleKey;
  // Route prefixes owned by the module (hidden from nav and blocked when disabled)
  routes: string[];
  // Enabled for clinics without a license (current test clinics keep existing features)
  defaultEnabled: boolean;
  // Not built yet: listed so clinics can see what is coming, never enabled
  planned?: boolean;
};

export const MODULES: ModuleDef[] = [
  { key: "inventory", routes: ["/inventory"], defaultEnabled: true },
  { key: "staff", routes: ["/staff"], defaultEnabled: true },
  { key: "smsReminders", routes: [], defaultEnabled: false, planned: true },
  { key: "presvet", routes: [], defaultEnabled: false, planned: true },
  { key: "knowledgeBase", routes: [], defaultEnabled: false, planned: true },
];

export const DEFAULT_MODULES: ModuleKey[] = MODULES.filter((m) => m.defaultEnabled).map((m) => m.key);

export function isModuleKey(value: string): value is ModuleKey {
  return MODULES.some((m) => m.key === value);
}

// Module that owns a pathname, if any
export function moduleForPath(pathname: string): ModuleKey | undefined {
  return MODULES.find((m) => m.routes.some((r) => pathname === r || pathname.startsWith(`${r}/`)))?.key;
}
