"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateStaffProfile, deactivateStaff, reactivateStaff, getLeaveBalance } from "@/lib/actions/staff";
import { Role, LeaveType, LeaveStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StaffDocuments } from "./StaffDocuments";
import { StaffShiftCalendar } from "./StaffShiftCalendar";
import { StaffCertificationsTab } from "./StaffCertificationsTab";
import { PerformanceReviewsTab } from "./PerformanceReviewsTab";
import { LeaveRequestDialog } from "./LeaveRequestDialog";
import { LeaveReviewDialog } from "./LeaveReviewDialog";
import { format } from "date-fns";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, Clock, CalendarDays, PieChart } from "lucide-react";
import { cn } from "@/lib/utils";

type StaffFull = {
  id: string;
  isActive: boolean;
  specialization: string | null;
  licenseNumber: string | null;
  education: string | null;
  diplomaPath: string | null;
  contractPath: string | null;
  salaryAmount: number | null;
  salaryType: "HOURLY" | "MONTHLY";
  hireDate: Date | null;
  contractType: "FULL_TIME" | "PART_TIME" | "CONTRACTOR";
  canManageStaff: boolean;
  annualLeaveDays: number;
  emergencyName: string | null;
  emergencyPhone: string | null;
  notes: string | null;
  user: { id: string; name: string; email: string; role: Role; avatar: string | null; phone: string | null };
  leaveRequests: Array<{ id: string; type: LeaveType; startDate: Date; endDate: Date; reason: string | null; status: LeaveStatus; reviewedBy?: { name: string } | null; reviewNote: string | null }>;
  certifications: Array<{ id: string; name: string; issuedBy: string | null; issuedDate: Date | null; expiryDate: Date | null }>;
  performanceReviews: Array<{ id: string; period: string; score: number | null; comment: string | null; createdAt: Date; reviewer: { name: string } }>;
  auditLogs: Array<{ id: string; field: string; oldValue: string | null; newValue: string | null; createdAt: Date; changedBy: { name: string } }>;
};

type Shift = { id: string; userId: string; startTime: Date; endTime: Date; note: string | null };

interface StaffProfileTabsProps {
  staff: StaffFull;
  shifts: Shift[];
  isAdmin: boolean;
  canManage: boolean;
}

const STATUS_ICONS = {
  PENDING: <Clock className="h-3.5 w-3.5 text-yellow-500" />,
  APPROVED: <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />,
  REJECTED: <XCircle className="h-3.5 w-3.5 text-red-500" />,
};

const STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  VACATION: "Vacaciones",
  SICK_LEAVE: "Baja médica",
  UNPAID_LEAVE: "Excedencia",
  AGREEMENT: "Permiso acordado",
};

export function StaffProfileTabs({ staff, shifts, isAdmin, canManage }: StaffProfileTabsProps) {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [reviewLeave, setReviewLeave] = useState<(typeof staff.leaveRequests)[0] | null>(null);

  const [form, setForm] = useState({
    specialization: staff.specialization ?? "",
    licenseNumber: staff.licenseNumber ?? "",
    education: staff.education ?? "",
    salaryAmount: staff.salaryAmount?.toString() ?? "",
    salaryType: staff.salaryType,
    hireDate: staff.hireDate ? format(new Date(staff.hireDate), "yyyy-MM-dd") : "",
    contractType: staff.contractType,
    canManageStaff: staff.canManageStaff,
    annualLeaveDays: staff.annualLeaveDays.toString(),
    emergencyName: staff.emergencyName ?? "",
    emergencyPhone: staff.emergencyPhone ?? "",
    notes: staff.notes ?? "",
  });

  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateStaffProfile(staff.id, {
        ...form,
        salaryAmount: form.salaryAmount ? Number(form.salaryAmount) : undefined,
        annualLeaveDays: Number(form.annualLeaveDays),
      });
      if (result?.error) { toast.error(t("errorSave")); return; }
      toast.success(t("saved"));
      router.refresh();
    });
  }

  function handleDeactivate() {
    startTransition(async () => {
      await (staff.isActive ? deactivateStaff(staff.id) : reactivateStaff(staff.id));
      toast.success(t("saved"));
      router.refresh();
    });
  }

  // Calculate leave balance for current year
  const currentYear = new Date().getFullYear();
  const approvedVacationDays = staff.leaveRequests
    .filter((l) => l.status === "APPROVED" && l.type === "VACATION" &&
      new Date(l.startDate).getFullYear() === currentYear)
    .reduce((sum, l) => {
      const ms = new Date(l.endDate).getTime() - new Date(l.startDate).getTime();
      return sum + Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1;
    }, 0);
  const leaveRemaining = Math.max(0, staff.annualLeaveDays - approvedVacationDays);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            {staff.user.avatar && <AvatarImage src={staff.user.avatar} />}
            <AvatarFallback className="bg-primary/10 text-primary text-lg">
              {staff.user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-semibold">{staff.user.name}</h2>
            <p className="text-sm text-muted-foreground">{staff.user.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">{staff.user.role}</Badge>
              <Badge variant={staff.isActive ? "default" : "secondary"} className="text-xs">
                {staff.isActive ? t("active") : t("inactive")}
              </Badge>
            </div>
          </div>
        </div>
        {isAdmin && (
          <Button
            variant={staff.isActive ? "destructive" : "outline"}
            size="sm"
            disabled={isPending}
            onClick={handleDeactivate}
          >
            {staff.isActive ? t("deactivate") : t("reactivate")}
          </Button>
        )}
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="profile">{t("profile")}</TabsTrigger>
          <TabsTrigger value="documents">{t("documents")}</TabsTrigger>
          <TabsTrigger value="schedule">{t("schedule")}</TabsTrigger>
          <TabsTrigger value="leaves">{t("leaves")}</TabsTrigger>
          <TabsTrigger value="certifications">{t("certifications")}</TabsTrigger>
          <TabsTrigger value="reviews">{t("reviews")}</TabsTrigger>
        </TabsList>

        {/* Profile tab */}
        <TabsContent value="profile" className="mt-4">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t("specialization")}</Label>
                <Input value={form.specialization} onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("licenseNumber")}</Label>
                <Input value={form.licenseNumber} onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>{t("education")}</Label>
                <Textarea rows={2} value={form.education} onChange={(e) => setForm((f) => ({ ...f, education: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("salaryAmount")}</Label>
                <Input type="number" min={0} value={form.salaryAmount} onChange={(e) => setForm((f) => ({ ...f, salaryAmount: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("salaryType")}</Label>
                <Select value={form.salaryType} onValueChange={(v) => setForm((f) => ({ ...f, salaryType: v as "HOURLY" | "MONTHLY" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">{t("monthly")}</SelectItem>
                    <SelectItem value="HOURLY">{t("hourly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("hireDate")}</Label>
                <input type="date" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={form.hireDate} onChange={(e) => setForm((f) => ({ ...f, hireDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("contractType")}</Label>
                <Select value={form.contractType} onValueChange={(v) => setForm((f) => ({ ...f, contractType: v as typeof form.contractType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">{t("fullTime")}</SelectItem>
                    <SelectItem value="PART_TIME">{t("partTime")}</SelectItem>
                    <SelectItem value="CONTRACTOR">{t("contractor")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("annualLeaveDays")}</Label>
                <Input type="number" min={0} max={365} value={form.annualLeaveDays} onChange={(e) => setForm((f) => ({ ...f, annualLeaveDays: e.target.value }))} />
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="canManage" checked={form.canManageStaff} onChange={(e) => setForm((f) => ({ ...f, canManageStaff: e.target.checked }))} className="rounded" />
                  <Label htmlFor="canManage" className="cursor-pointer">{t("canManageStaff")}</Label>
                </div>
              )}
              <div className="space-y-1">
                <Label>{t("emergencyName")}</Label>
                <Input value={form.emergencyName} onChange={(e) => setForm((f) => ({ ...f, emergencyName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("emergencyPhone")}</Label>
                <Input value={form.emergencyPhone} onChange={(e) => setForm((f) => ({ ...f, emergencyPhone: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>{t("notes")}</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>{isPending ? tc("loading") : tc("save")}</Button>
            </div>
          </form>

          {/* Audit log */}
          {staff.auditLogs.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">{t("auditLog")}</h3>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {[t("field"), t("oldValue"), t("newValue"), t("changedBy"), "Fecha"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staff.auditLogs.map((log) => (
                      <tr key={log.id} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{log.field}</td>
                        <td className="px-3 py-2 text-muted-foreground">{log.oldValue ?? "—"}</td>
                        <td className="px-3 py-2">{log.newValue ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{log.changedBy.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{format(new Date(log.createdAt), "dd/MM/yy HH:mm")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Documents tab */}
        <TabsContent value="documents" className="mt-4">
          <StaffDocuments
            staffProfileId={staff.id}
            diplomaPath={staff.diplomaPath}
            contractPath={staff.contractPath}
          />
        </TabsContent>

        {/* Schedule tab */}
        <TabsContent value="schedule" className="mt-4">
          <StaffShiftCalendar userId={staff.user.id} initialShifts={shifts} />
        </TabsContent>

        {/* Leaves tab */}
        <TabsContent value="leaves" className="mt-4">
          <div className="space-y-4">
            {/* Leave balance card */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t("leaveLimit"), value: staff.annualLeaveDays, icon: <CalendarDays className="h-4 w-4" /> },
                { label: t("leaveUsed"), value: approvedVacationDays, icon: <PieChart className="h-4 w-4" /> },
                { label: t("leaveRemaining"), value: leaveRemaining, icon: <CheckCircle className="h-4 w-4" /> },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-border bg-card p-3 text-center">
                  <div className="flex justify-center text-muted-foreground mb-1">{c.icon}</div>
                  <p className="text-xl font-bold">{c.value}</p>
                  <p className="text-xs text-muted-foreground">{c.label} {t("days")}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={() => setLeaveDialogOpen(true)}>
                {t("requestLeave")}
              </Button>
            </div>

            {staff.leaveRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t("noLeaves")}</p>
            ) : (
              <div className="space-y-3">
                {staff.leaveRequests.map((leave) => (
                  <div key={leave.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          {STATUS_ICONS[leave.status]}
                          <span className="text-sm font-medium">{LEAVE_TYPE_LABELS[leave.type]}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(leave.startDate), "dd/MM/yyyy")} – {format(new Date(leave.endDate), "dd/MM/yyyy")}
                        </p>
                        {leave.reason && <p className="text-xs text-muted-foreground">{leave.reason}</p>}
                        {leave.reviewNote && <p className="text-xs text-muted-foreground italic">"{leave.reviewNote}"</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium",
                          leave.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" :
                          leave.status === "REJECTED" ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        )}>
                          {STATUS_LABELS[leave.status]}
                        </span>
                        {canManage && leave.status === "PENDING" && (
                          <Button variant="outline" size="sm" onClick={() => setReviewLeave(leave)}>
                            {t("reviewLeave")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Certifications tab */}
        <TabsContent value="certifications" className="mt-4">
          <StaffCertificationsTab staffProfileId={staff.id} certifications={staff.certifications} />
        </TabsContent>

        {/* Performance reviews tab */}
        <TabsContent value="reviews" className="mt-4">
          <PerformanceReviewsTab staffProfileId={staff.id} reviews={staff.performanceReviews} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>

      <LeaveRequestDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen} />
      {reviewLeave && (
        <LeaveReviewDialog
          open
          onOpenChange={(v) => !v && setReviewLeave(null)}
          leaveId={reviewLeave.id}
          staffName={staff.user.name}
          leaveType={reviewLeave.type}
          startDate={reviewLeave.startDate}
          endDate={reviewLeave.endDate}
          reason={reviewLeave.reason}
        />
      )}
    </div>
  );
}
