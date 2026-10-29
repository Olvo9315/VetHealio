"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { ArrowLeftRight, ArrowRight, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { mergeOwners, searchOwnerCards, type OwnerCard } from "@/lib/actions/owners";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Join two records of the same person. The one on the left is kept; the pets, history and signed
// documents of the one on the right move to it and the right one disappears. Swap if needed.
export function MergeOwnersDialog({
  keep: keepProp,
  merge: mergeProp,
  open,
  onOpenChange,
  onMerged,
}: {
  keep: OwnerCard;
  merge?: OwnerCard;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onMerged?: (keptId: string) => void;
}) {
  const t = useTranslations("owners");
  const tc = useTranslations("common");
  const router = useRouter();
  const [keep, setKeep] = useState(keepProp);
  const [other, setOther] = useState<OwnerCard | undefined>(mergeProp);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OwnerCard[]>([]);
  const [isBusy, startBusy] = useTransition();

  useEffect(() => {
    if (!open) return;
    setKeep(keepProp);
    setOther(mergeProp);
    setQuery("");
    setResults([]);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(() => searchOwnerCards(query, keep.id).then(setResults), 250);
    return () => clearTimeout(h);
  }, [query, keep.id]);

  function merge() {
    if (!other) return;
    startBusy(async () => {
      const result = await mergeOwners(keep.id, other.id);
      if ("error" in result) { toast.error(t("mergeError")); return; }
      toast.success(t("merged", { count: result.pets }));
      onOpenChange(false);
      if (onMerged) onMerged(keep.id);
      else router.push(`/owners/${keep.id}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("mergeTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("mergeIntro")}</p>

          {!other && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input autoFocus className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("mergeSearch")} />
              </div>
              <div className="space-y-1.5">
                {results.map((o) => (
                  <button key={o.id} type="button" onClick={() => setOther(o)} className="w-full text-left">
                    <OwnerBox owner={o} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {other && (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{t("keepLabel")}</p>
                  <OwnerBox owner={keep} highlight />
                </div>
                <div className="flex flex-col items-center justify-center gap-2 pt-5">
                  <ArrowLeftRight className="w-4 h-4 text-muted-foreground hidden sm:block" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => { const k = keep; setKeep(other); setOther(k); }}
                  >
                    {t("swap")}
                  </Button>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400">{t("mergeLabel")}</p>
                  <OwnerBox owner={other} faded />
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <p className="font-medium">{t("mergeWillDo")}</p>
                {other.pets.length > 0 && (
                  <p className="flex items-center gap-1.5">
                    <ArrowRight className="w-4 h-4 text-primary" />
                    {t("mergePetsMove", { pets: other.pets.map((p) => p.name).join(", "), name: `${keep.firstName} ${keep.lastName}` })}
                  </p>
                )}
                <p className="flex items-center gap-1.5"><ArrowRight className="w-4 h-4 text-primary" />{t("mergeFill")}</p>
                <p className="flex items-center gap-1.5"><ArrowRight className="w-4 h-4 text-primary" />{t("mergeDelete", { name: `${other.firstName} ${other.lastName}` })}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 pt-1">{t("mergeIrreversible")}</p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => (mergeProp ? onOpenChange(false) : setOther(undefined))}>
                  {mergeProp ? tc("cancel") : t("chooseOther")}
                </Button>
                <Button className="flex-1" disabled={isBusy} onClick={merge}>
                  {isBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t("mergeConfirm")}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OwnerBox({ owner, highlight, faded }: { owner: OwnerCard; highlight?: boolean; faded?: boolean }) {
  const t = useTranslations("owners");
  return (
    <div className={cn("rounded-lg border p-3 text-sm h-full", highlight && "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20", faded && "border-red-300 bg-red-50/40 dark:bg-red-950/20")}>
      <p className="font-semibold">{owner.firstName} {owner.lastName}</p>
      <p className="text-xs text-muted-foreground">
        {[owner.phone, owner.phone2, owner.email, owner.nif].filter(Boolean).join(" · ")}
      </p>
      <p className="text-xs mt-1">
        {owner.pets.length ? owner.pets.map((p) => p.name).join(", ") : <span className="text-muted-foreground">{t("noPets")}</span>}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{t("createdOn", { date: format(new Date(owner.createdAt), "dd/MM/yyyy") })}</p>
    </div>
  );
}
