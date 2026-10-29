"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Merge, Users } from "lucide-react";
import type { OwnerCard } from "@/lib/actions/owners";
import { Button } from "@/components/ui/button";
import { MergeOwnersDialog, OwnerBox } from "./MergeOwnersDialog";

// "Is this the same person?" for one owner: shown on their page when likely duplicates exist
export function OwnerDuplicateBanner({ owner, duplicates }: { owner: OwnerCard; duplicates: OwnerCard[] }) {
  const t = useTranslations("owners");
  const [merging, setMerging] = useState<OwnerCard | null>(null);
  if (!duplicates.length) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2">
      <p className="text-sm font-medium flex items-center gap-1.5"><Users className="w-4 h-4" />{t("maybeSame")}</p>
      {duplicates.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-2">
          <Link href={`/owners/${d.id}`} className="flex-1 min-w-[200px] text-sm hover:underline">
            {d.firstName} {d.lastName} · {d.phone}
            {d.pets.length > 0 && <span className="text-muted-foreground"> · {d.pets.map((p) => p.name).join(", ")}</span>}
          </Link>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-background" onClick={() => setMerging(d)}>
            <Merge className="w-4 h-4" />{t("mergeHere")}
          </Button>
        </div>
      ))}
      {merging && <MergeOwnersDialog keep={owner} merge={merging} open={!!merging} onOpenChange={(v) => !v && setMerging(null)} />}
    </div>
  );
}

// All groups of probable duplicates, to clean up the records in one place
export function OwnerDuplicatesList({ groups }: { groups: OwnerCard[][] }) {
  const t = useTranslations("owners");
  const router = useRouter();
  const [pair, setPair] = useState<{ keep: OwnerCard; merge: OwnerCard } | null>(null);

  if (!groups.length) {
    return <p className="text-sm text-muted-foreground text-center py-12">{t("noDuplicates")}</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("duplicatesIntro")}</p>
      {groups.map((g) => {
        // Suggest keeping the record with most pets, then the oldest
        const keep = [...g].sort((a, b) => b.pets.length - a.pets.length || +new Date(a.createdAt) - +new Date(b.createdAt))[0];
        return (
          <div key={g.map((o) => o.id).join()} className="rounded-xl border bg-card p-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {g.map((o) => (
                <div key={o.id} className="space-y-1.5">
                  <Link href={`/owners/${o.id}`}><OwnerBox owner={o} highlight={o.id === keep.id} /></Link>
                  {o.id !== keep.id && (
                    <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setPair({ keep, merge: o })}>
                      <Merge className="w-4 h-4" />{t("mergeInto", { name: `${keep.firstName} ${keep.lastName}` })}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {pair && (
        <MergeOwnersDialog
          keep={pair.keep}
          merge={pair.merge}
          open={!!pair}
          onOpenChange={(v) => !v && setPair(null)}
          onMerged={() => router.refresh()}
        />
      )}
    </div>
  );
}
