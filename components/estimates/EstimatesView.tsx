"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileText, Loader2 } from "lucide-react";
import { getEstimates, type EstimateFull } from "@/lib/actions/estimates";
import { EstimatesList } from "./EstimatesList";
import { EstimateDialog } from "./EstimateDialog";
import { cn } from "@/lib/utils";

// Finances → Presupuestos: open ones (waiting for the owner's answer) or all of them.
// New presupuestos are written from the patient's page or the visit.
export function EstimatesView() {
  const t = useTranslations("estimates");
  const router = useRouter();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [rows, setRows] = useState<EstimateFull[] | null>(null);
  const [editing, setEditing] = useState<EstimateFull | null>(null);
  const [, startLoad] = useTransition();

  useEffect(() => { startLoad(async () => setRows(await getEstimates(filter))); }, [filter]);

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5 bg-muted/40">
          {(["open", "all"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn("px-3 h-8 text-sm rounded-md whitespace-nowrap", filter === f ? "bg-background shadow-sm font-medium" : "text-muted-foreground")}>
              {t(`filter_${f}`)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("newFromPatient")}</p>
      </div>
      {rows === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t("empty")}</p>
        </div>
      ) : (
        <EstimatesList estimates={rows} onOpen={setEditing} withPet />
      )}
      {editing && (
        <EstimateDialog
          open
          onOpenChange={(v) => !v && setEditing(null)}
          petId={editing.petId}
          petName={editing.pet.name}
          estimate={editing}
          onSaved={(e) => setRows((prev) => prev?.map((x) => (x.id === e.id ? e : x)) ?? prev)}
          onDeleted={(id) => setRows((prev) => prev?.filter((x) => x.id !== id) ?? prev)}
          onBilled={() => router.push(`/patients/${editing.petId}`)}
        />
      )}
    </div>
  );
}
