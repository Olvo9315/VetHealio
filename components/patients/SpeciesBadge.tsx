import { Species } from "@prisma/client";
import { cn } from "@/lib/utils";

const speciesConfig: Record<
  Species,
  { label: string; emoji: string; className: string }
> = {
  DOG: { label: "Perro", emoji: "🐕", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  CAT: { label: "Gato", emoji: "🐈", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  BIRD: { label: "Pájaro", emoji: "🦜", className: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300" },
  RABBIT: { label: "Conejo", emoji: "🐇", className: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300" },
  REPTILE: { label: "Reptil", emoji: "🦎", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  OTHER: { label: "Otro", emoji: "🐾", className: "bg-muted text-muted-foreground" },
};

interface SpeciesBadgeProps {
  species: Species;
  size?: "sm" | "md";
}

export function SpeciesBadge({ species, size = "sm" }: SpeciesBadgeProps) {
  const config = speciesConfig[species];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1",
        config.className
      )}
    >
      <span>{config.emoji}</span>
      {config.label}
    </span>
  );
}

export { speciesConfig };
