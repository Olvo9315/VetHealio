"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createPerformanceReview, deletePerformanceReview } from "@/lib/actions/performance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Star, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Review = {
  id: string;
  period: string;
  score: number | null;
  comment: string | null;
  createdAt: Date;
  reviewer: { name: string };
};

interface PerformanceReviewsTabProps {
  staffProfileId: string;
  reviews: Review[];
  isAdmin: boolean;
}

function ScoreStars({ score }: { score: number | null }) {
  if (!score) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <Star key={s} className={cn("h-4 w-4", s <= score ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30")} />
      ))}
    </div>
  );
}

export function PerformanceReviewsTab({ staffProfileId, reviews, isAdmin }: PerformanceReviewsTabProps) {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ period: "", score: "", comment: "" });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createPerformanceReview({
        staffProfileId,
        period: form.period,
        score: form.score ? Number(form.score) : undefined,
        comment: form.comment,
      });
      if (result?.error) { toast.error(t("errorSave")); return; }
      toast.success(t("saved"));
      setDialogOpen(false);
      setForm({ period: "", score: "", comment: "" });
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deletePerformanceReview(id);
      toast.success(t("deleted"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />{t("addReview")}
          </Button>
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <BarChart3 className="mx-auto h-8 w-8 mb-2 opacity-30" />
          {t("noReviews")}
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{r.period}</span>
                    <ScoreStars score={r.score} />
                  </div>
                  {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                  <p className="text-xs text-muted-foreground">
                    {r.reviewer.name} · {format(new Date(r.createdAt), "dd/MM/yyyy")}
                  </p>
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={isPending}
                    onClick={() => handleDelete(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t("addReview")}</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("period")}</Label>
                  <Input required placeholder="Q1-2026" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>{t("score")} (1-5)</Label>
                  <Input type="number" min={1} max={5} value={form.score} onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t("comment")}</Label>
                <Textarea rows={4} maxLength={2000} value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{tc("cancel")}</Button>
                <Button type="submit" disabled={isPending}>{isPending ? tc("loading") : tc("add")}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
