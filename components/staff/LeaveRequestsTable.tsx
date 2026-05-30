"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LeaveReviewDialog } from "./LeaveReviewDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { LeaveType, LeaveStatus } from "@prisma/client";
import { ClipboardList } from "lucide-react";

type LeaveItem = {
  id: string;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  status: LeaveStatus;
  staffProfile: {
    user: { name: string; email: string; avatar: string | null };
  };
};

interface LeaveRequestsTableProps {
  leaves: LeaveItem[];
}

export function LeaveRequestsTable({ leaves }: LeaveRequestsTableProps) {
  const t = useTranslations("staff");
  const [reviewLeave, setReviewLeave] = useState<LeaveItem | null>(null);

  const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
    VACATION: t("vacation"),
    SICK_LEAVE: t("sickLeave"),
    UNPAID_LEAVE: t("unpaidLeave"),
    AGREEMENT: t("agreement"),
  };

  if (leaves.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <ClipboardList className="mx-auto h-10 w-10 mb-3 opacity-30" />
        <p>{t("noLeaves")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t("pendingRequests")}</h2>
      {leaves.map((leave) => (
        <div key={leave.id} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar className="h-10 w-10 shrink-0">
              {leave.staffProfile.user.avatar && <AvatarImage src={leave.staffProfile.user.avatar} />}
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {leave.staffProfile.user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{leave.staffProfile.user.name}</p>
              <p className="text-xs text-muted-foreground">{LEAVE_TYPE_LABELS[leave.type]}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(leave.startDate), "dd/MM/yyyy")} – {format(new Date(leave.endDate), "dd/MM/yyyy")}
              </p>
              {leave.reason && <p className="text-xs text-muted-foreground mt-0.5 truncate">{leave.reason}</p>}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setReviewLeave(leave)}>
            {t("reviewLeave")}
          </Button>
        </div>
      ))}

      {reviewLeave && (
        <LeaveReviewDialog
          open
          onOpenChange={(v) => !v && setReviewLeave(null)}
          leaveId={reviewLeave.id}
          staffName={reviewLeave.staffProfile.user.name}
          leaveType={reviewLeave.type}
          startDate={reviewLeave.startDate}
          endDate={reviewLeave.endDate}
          reason={reviewLeave.reason}
        />
      )}
    </div>
  );
}
