// Display path of a catalog service through all its parent categories, e.g.
// "Desparasitación › Perro › 21 - 30 kg": a bare sub-service name often says little on its own.
type CatalogNode = { id: string; name: string; parentId: string | null };

export function servicePath(services: CatalogNode[], id: string, fallback: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let cur = services.find((s) => s.id === id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.name);
    const parentId: string | null = cur.parentId;
    cur = parentId ? services.find((s) => s.id === parentId) : undefined;
  }
  return parts.length ? parts.join(" › ") : fallback;
}
