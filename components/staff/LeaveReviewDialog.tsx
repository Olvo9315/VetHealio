"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { reviewLeaveRequest } from "@/lib/actions/leaveRequests";
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
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CheckCircle, XCircle } from "lucide-react";

interface LeaveReviewDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leaveId: string;
  staffName: string;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  reason?: string | null;
}

export function LeaveReviewDialog({
  open, onOpenChange, leaveId, staffName, leaveType, startDate, endDate, reason,
}: LeaveReviewDialogProps) {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reviewNote, setReviewNote] = useState("");

  const TYPE_LABELS: Record<LeaveType, string> = {
    VACATION: t("vacation"),
    SICK_LEAVE: t("sickLeave"),
    UNPAID_LEAVE: t("unpaidLeave"),
    AGREEMENT: t("agreement"),
  };

  function submit(status: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      await reviewLeaveRequest(leaveId, status, reviewNote);
      toast.success(t("saved"));
      onOpenChange(false);
      setReviewNote("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("reviewLeave")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
            <p><span className="font-medium">{t("name")}:</span> {staffName}</p>
            <p><span className="font-medium">{t("leaveType")}:</span> {TYPE_LABELS[leaveType]}</p>
            <p><span className="font-medium">{t("startDate")}:</span> {format(new Date(startDate), "dd/MM/yyyy")}</p>
            <p><span className="font-medium">{t("endDate")}:</span> {format(new Date(endDate), "dd/MM/yyyy")}</p>
            {reason && <p><span className="font-medium">{t("reason")}:</span> {reason}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t("reviewNote")}</Label>
            <Textarea rows={3} maxLength={500} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tc("cancel")}</Button>
            <Button type="button" variant="destructive" disabled={isPending} onClick={() => submit("REJECTED")}>
              <XCircle className="h-4 w-4 mr-2" />{t("reject")}
            </Button>
            <Button type="button" disabled={isPending} onClick={() => submit("APPROVED")}>
              <CheckCircle className="h-4 w-4 mr-2" />{t("approve")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
