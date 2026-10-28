// Interface accent colors. Every option keeps the lightness and softness of the brand green and
// only changes the hue, so the interface keeps its look whichever one is picked.
// The CSS for each one lives in app/globals.css ([data-accent="…"]).
export const ACCENTS = [
  { id: "green", hex: "#1D9E75" },
  { id: "teal", hex: "#00929F" },
  { id: "blue", hex: "#3883D1" },
  { id: "indigo", hex: "#6C68CC" },
  { id: "violet", hex: "#9E62C0" },
  { id: "rose", hex: "#CE597A" },
  { id: "coral", hex: "#DA6946" },
  { id: "honey", hex: "#BC8220" },
  { id: "graphite", hex: "#5A6472" },
] as const;

export type Accent = (typeof ACCENTS)[number]["id"];
export const DEFAULT_ACCENT: Accent = "green";
export const ACCENT_IDS = ACCENTS.map((a) => a.id) as [Accent, ...Accent[]];

export function toAccent(value: string | undefined | null): Accent {
  return ACCENTS.some((a) => a.id === value) ? (value as Accent) : DEFAULT_ACCENT;
}

export function accentHex(accent: Accent): string {
  return ACCENTS.find((a) => a.id === accent)?.hex ?? ACCENTS[0].hex;
}
