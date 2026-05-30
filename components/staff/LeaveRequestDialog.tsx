"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createLeaveRequest } from "@/lib/actions/leaveRequests";
import { LeaveType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface LeaveRequestDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const LEAVE_TYPES: LeaveType[] = ["VACATION", "SICK_LEAVE", "UNPAID_LEAVE", "AGREEMENT"];

export function LeaveRequestDialog({ open, onOpenChange }: LeaveRequestDialogProps) {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ type: "VACATION" as LeaveType, startDate: "", endDate: "", reason: "" });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createLeaveRequest(form);
      if (result?.error) { toast.error(t("errorSave")); return; }
      toast.success(t("saved"));
      onOpenChange(false);
      setForm({ type: "VACATION", startDate: "", endDate: "", reason: "" });
      router.refresh();
    });
  }

  const TYPE_LABELS: Record<LeaveType, string> = {
    VACATION: t("vacation"),
    SICK_LEAVE: t("sickLeave"),
    UNPAID_LEAVE: t("unpaidLeave"),
    AGREEMENT: t("agreement"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("requestLeave")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>{t("leaveType")}</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as LeaveType }))}>
              <SelectTrigger><SelectValue>{TYPE_LABELS[form.type]}</SelectValue></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("startDate")}</Label>
              <input type="date" required className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("endDate")}</Label>
              <input type="date" required className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} min={form.startDate} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("reason")}</Label>
            <Textarea rows={3} maxLength={500} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tc("cancel")}</Button>
            <Button type="submit" disabled={isPending}>{isPending ? tc("loading") : tc("create")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
