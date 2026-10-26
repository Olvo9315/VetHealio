import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClinicBrand = { name: string; logoUrl: string | null };

interface ClinicMarkProps {
  logoUrl: string | null;
  name: string;
  className?: string;
  iconClassName?: string;
}

// Clinic logo if uploaded, otherwise the default VetHealio heart badge
export function ClinicMark({ logoUrl, name, className, iconClassName }: ClinicMarkProps) {
  if (logoUrl) {
    return (
      <div className={cn("rounded-lg overflow-hidden bg-white flex items-center justify-center shrink-0", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name} className="w-full h-full object-contain" />
      </div>
    );
  }
  return (
    <div className={cn("rounded-lg bg-primary flex items-center justify-center shrink-0", className)}>
      <Heart className={cn("text-primary-foreground", iconClassName)} />
    </div>
  );
}
