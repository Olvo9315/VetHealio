"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { differenceInMinutes, endOfDay, format, startOfDay } from "date-fns";
import { AlertTriangle, CheckCircle2, DoorOpen, Loader2, LogIn, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import type { AppointmentStatus } from "@prisma/client";
import { getAppointmentList, updateAppointmentStatus, type AppointmentListRow } from "@/lib/actions/appointments";
import { Button } from "@/components/ui/button";
import { SpeciesBadge } from "@/components/patients/SpeciesBadge";
import { cn } from "@/lib/utils";

// Today's flow at reception: who is expected, who is waiting (and for how long), who is being seen
// and who is done (finished, paid, cancelled or not shown)
export function WaitingRoom() {
  const t = useTranslations("appointments");
  const [rows, setRows] = useState<AppointmentListRow[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startUpdate] = useTransition();

  const load = useCallback(async () => {
    const today = new Date();
    setRows(
      await getAppointmentList({
        from: startOfDay(today).toISOString(),
        to: endOfDay(today).toISOString(),
      })
    );
  }, []);

  useEffect(() => {
    load();
    // Other devices at reception change the list too
    const refresh = setInterval(load, 30_000);
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => { clearInterval(refresh); clearInterval(tick); };
  }, [load]);

  function setStatus(row: AppointmentListRow, status: AppointmentStatus) {
    setBusyId(row.id);
    startUpdate(async () => {
      await updateAppointmentStatus(row.id, status);
      setRows((prev) =>
        prev?.map((r) => (r.id === row.id ? { ...r, status, arrivedAt: status === "ARRIVED" ? new Date() : r.arrivedAt } : r)) ?? prev
      );
      setBusyId(null);
      toast.success(t("statusUpdated"));
    });
  }

  if (!rows) {
    return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const paid = (r: AppointmentListRow) => r.invoice?.status === "PAID";
  const closed = (r: AppointmentListRow) => r.status === "COMPLETED" || r.status === "CANCELLED" || r.status === "NO_SHOW" || paid(r);
  const waiting = rows.filter((r) => r.status === "ARRIVED" && !paid(r)).sort((a, b) => +new Date(a.arrivedAt ?? 0) - +new Date(b.arrivedAt ?? 0));
  const inRoom = rows.filter((r) => r.status === "IN_PROGRESS" && !paid(r));
  const expected = rows.filter((r) => r.status === "SCHEDULED" && !paid(r));
  // Finished, paid, cancelled or not shown: the day's history, newest at the top
  const done = rows.filter(closed).sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));
  const seen = done.filter((r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW").length;

  // Left to right like a to-do board: expected → waiting → in consultation → done
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Column title={t("expectedToday")} count={expected.length} icon={LogIn}>
        {expected.map((r) => (
          <Card key={r.id} row={r}>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 flex-1" disabled={busyId === r.id} onClick={() => setStatus(r, "ARRIVED")}>
                <LogIn className="w-4 h-4" />{t("checkIn")}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={busyId === r.id} onClick={() => setStatus(r, "NO_SHOW")}>
                {t("noShow")}
              </Button>
            </div>
          </Card>
        ))}
        {!expected.length && <Empty text={t("expectedEmpty")} />}
      </Column>

      <Column title={t("waitingNow")} count={waiting.length} icon={DoorOpen} accent>
        {waiting.map((r) => {
          const minutes = r.arrivedAt ? differenceInMinutes(now, new Date(r.arrivedAt)) : 0;
          return (
            <Card key={r.id} row={r}>
              <p className={cn("text-xs font-medium", minutes >= 20 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                {t("waitingFor", { minutes })}
              </p>
              <Button size="sm" className="h-8 gap-1.5 w-full mt-2" disabled={busyId === r.id} onClick={() => setStatus(r, "IN_PROGRESS")}>
                <Stethoscope className="w-4 h-4" />{t("callIn")}
              </Button>
            </Card>
          );
        })}
        {!waiting.length && <Empty text={t("waitingEmpty")} />}
      </Column>

      <Column title={t("inRoomNow")} count={inRoom.length} icon={Stethoscope}>
        {inRoom.map((r) => (
          <Card key={r.id} row={r}>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 w-full mt-2" disabled={busyId === r.id} onClick={() => setStatus(r, "COMPLETED")}>
              <CheckCircle2 className="w-4 h-4" />{t("finishVisit")}
            </Button>
          </Card>
        ))}
        {!inRoom.length && <Empty text={t("inRoomEmpty")} />}
      </Column>

      <Column title={t("doneColumn")} count={done.length} icon={CheckCircle2} footer={seen ? t("doneToday", { count: seen }) : undefined}>
        {done.map((r) => {
          const off = r.status === "CANCELLED" || r.status === "NO_SHOW";
          const due = !off && r.invoice && r.invoice.status !== "PAID" && r.invoice.totalAmount - r.invoice.paidAmount > 0.005;
          return (
            <Card key={r.id} row={r} muted={off}>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {off ? (
                  <Tag tone="muted">{r.status === "CANCELLED" ? t("cancelled") : t("noShow")}</Tag>
                ) : (
                  <>
                    {r.status === "COMPLETED" && <Tag tone="muted">{t("completedTag")}</Tag>}
                    {paid(r) && <Tag tone="ok">{t("paidTag")}</Tag>}
                    {due && <Tag tone="warn">{t("unpaidTag")}</Tag>}
                  </>
                )}
              </div>
            </Card>
          );
        })}
        {!done.length && <Empty text={t("doneEmpty")} />}
      </Column>
    </div>
  );
}

function Tag({ tone, children }: { tone: "ok" | "warn" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "text-[11px] px-2 py-0.5 rounded-full font-medium",
        tone === "ok" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
        tone === "warn" && "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
        tone === "muted" && "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function Column({
  title,
  count,
  icon: Icon,
  accent,
  footer,
  children,
}: {
  title: string;
  count: number;
  icon: React.ElementType;
  accent?: boolean;
  footer?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-3 space-y-2", accent && "border-primary/40")}>
      <h3 className="flex items-center gap-2 text-sm font-semibold px-1">
        <Icon className={cn("w-4 h-4", accent ? "text-primary" : "text-muted-foreground")} />
        {title}
        <span className="ml-auto text-xs font-medium rounded-full bg-muted px-2 py-0.5">{count}</span>
      </h3>
      <div className="space-y-2">{children}</div>
      {footer && <p className="text-xs text-muted-foreground px-1 pt-1">{footer}</p>}
    </section>
  );
}

function Card({ row, muted, children }: { row: AppointmentListRow; muted?: boolean; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border bg-background p-2.5", muted && "opacity-60 [&_a_p]:line-through")}>
      <Link href={`/patients/${row.pet.id}?appointment=${row.id}`} className="flex items-start gap-2">
        <SpeciesBadge species={row.pet.species} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-tight truncate">
            {row.pet.name} <span className="font-normal text-muted-foreground">· {row.pet.owner.firstName} {row.pet.owner.lastName}</span>
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {format(new Date(row.startTime), "HH:mm")} · {row.services.join(", ") || row.title} · {row.veterinarian.name}
            {row.room ? ` · ${row.room.name}` : ""}
          </p>
          {row.pet.alerts && (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300 flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span className="line-clamp-2">{row.pet.alerts}</span>
            </p>
          )}
        </div>
      </Link>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground text-center py-6">{text}</p>;
}
