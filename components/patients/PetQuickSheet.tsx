"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PetQuickInfo } from "./PetQuickInfo";

export type PetPreview = { id: string; name: string };

// Pet card opened by clicking a pet name: "Back" returns to where you were, "Open record" goes to the full page
export function PetQuickSheet({
  pet,
  onClose,
  side = "bottom",
}: {
  pet: PetPreview | null;
  onClose: () => void;
  side?: "bottom" | "right";
}) {
  const tp = useTranslations("petInfo");
  return (
    <Sheet open={!!pet} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side={side}
        className={cn(
          "overflow-y-auto",
          side === "bottom" ? "rounded-t-2xl max-h-[80vh]" : "w-full sm:max-w-sm flex flex-col"
        )}
      >
        <SheetHeader className="px-5 pt-5 pb-2">
          <SheetTitle>{pet?.name}</SheetTitle>
        </SheetHeader>
        {pet && <PetQuickInfo petId={pet.id} className="px-5" />}
        <div className={cn("flex gap-2 px-5 pb-5", side === "right" && "mt-auto pt-4 border-t border-border")}>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            {tp("back")}
          </Button>
          {pet && (
            <Link href={`/patients/${pet.id}`} className={cn(buttonVariants({ variant: "default" }), "flex-1")}>
              {tp("openCard")}
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
