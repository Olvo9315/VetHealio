"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { differenceInCalendarDays, format } from "date-fns";
import { BellOff, CalendarClock, Check, MessageCircle, Syringe, Undo2 } from "lucide-react";
import { getReminderMessage, markReminderSent, type ReminderRow } from "@/lib/actions/reminders";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LANGS = ["es", "ru", "en"] as const;

// Today's reminders: one tap opens WhatsApp with the message written, then it is marked as sent
export function RemindersList({ initial }: { initial: ReminderRow[] }) {
  const t = useTranslations("reminders");
  const uiLocale = useLocale();
  const [rows, setRows] = useState(initial);
  const [lang, setLang] = useState<string>(LANGS.includes(uiLocale as never) ? uiLocale : "es");
  const [filter, setFilter] = useState<"todo" | "sent">("todo");
  const [, startUpdate] = useTransition();

  const today = new Date();
  const visible = rows.filter((r) => (filter === "todo" ? !r.sentAt : !!r.sentAt));
  const appointments = visible.filter((r) => r.kind === "appointment");
  const vaccines = visible.filter((r) => r.kind === "vaccine");

  function setSent(row: ReminderRow, sent: boolean) {
    setRows((prev) => prev.map((r) => (r.id === row.id && r.kind === row.kind ? { ...r, sentAt: sent ? new Date() : null } : r)));
    startUpdate(() => markReminderSent(row.kind, row.id, sent));
  }

  function send(row: ReminderRow) {
    // Open the window right away (pop-up blockers), fill it when the text is ready
    const win = window.open("", "_blank");
    getReminderMessage(row.kind, row.id, lang).then((m) => {
      if (!m) { win?.close(); return; }
      const url = `https://wa.me/${m.whatsapp}?text=${encodeURIComponent(m.text)}`;
      if (win) win.location.href = url;
      else window.location.href = url;
      setSent(row, true);
    });
  }

  function Row({ row }: { row: ReminderRow }) {
    const days = differenceInCalendarDays(new Date(row.date), today);
    return (
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            <Link href={`/patients/${row.petId}`} className="hover:underline">{row.petName}</Link>
            <span className="font-normal text-muted-foreground"> · {row.ownerName}</span>
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {row.label} · {format(new Date(row.date), row.kind === "appointment" ? "dd/MM HH:mm" : "dd/MM/yyyy")}
            {row.kind === "vaccine" && (
              <span className={cn("ml-1.5 font-medium", days < 0 ? "text-red-600" : days <= 7 ? "text-amber-600" : "")}>
                {days < 0 ? t("overdue", { days: -days }) : days === 0 ? t("dueToday") : t("inDays", { days })}
              </span>
            )}
          </p>
          {!row.consent && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1"><BellOff className="w-3 h-3" />{t("noConsent")}</p>
          )}
        </div>
        {row.sentAt ? (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={() => setSent(row, false)}>
            <Undo2 className="w-4 h-4" />
            <span className="hidden sm:inline">{t("unmark")}</span>
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" title={t("markSent")} onClick={() => setSent(row, true)}>
              <Check className="w-4 h-4" />
            </Button>
            <Button size="sm" className="h-8 gap-1.5 bg-[#25D366] hover:bg-[#1fb257] text-white" disabled={!row.phone || !row.consent} onClick={() => send(row)}>
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5 bg-muted/40">
          {(["todo", "sent"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn("px-3 h-8 text-sm rounded-md", filter === f ? "bg-background shadow-sm font-medium" : "text-muted-foreground")}>
              {t(f === "todo" ? "toSend" : "sent")} ({rows.filter((r) => (f === "todo" ? !r.sentAt : !!r.sentAt)).length})
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">{t("messageLanguage")}</span>
          {LANGS.map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} className={cn("h-7 w-9 rounded text-xs font-medium border", lang === l ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground")}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <Section icon={CalendarClock} title={t("appointmentsSoon")} empty={t("noAppointments")}>
        {appointments.map((r) => <Row key={`a${r.id}`} row={r} />)}
      </Section>
      <Section icon={Syringe} title={t("vaccinesDue")} empty={t("noVaccines")}>
        {vaccines.map((r) => <Row key={`v${r.id}`} row={r} />)}
      </Section>
      <p className="text-xs text-muted-foreground">{t("howItWorks")}</p>
    </div>
  );
}

function Section({ icon: Icon, title, empty, children }: { icon: React.ElementType; title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <h3 className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold border-b bg-muted/30">
        <Icon className="w-4 h-4 text-primary" />
        {title}
        <span className="ml-auto text-xs font-medium text-muted-foreground">{children.length}</span>
      </h3>
      {children.length ? <div className="divide-y">{children}</div> : <p className="text-sm text-muted-foreground text-center py-6">{empty}</p>}
    </section>
  );
}
