import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { getReminders } from "@/lib/actions/reminders";
import { RemindersList } from "@/components/reminders/RemindersList";

export default async function RemindersPage() {
  const session = await auth();
  const t = await getTranslations("reminders");
  const rows = await getReminders(30);
  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6 max-w-3xl w-full mx-auto">
        <RemindersList initial={rows} />
      </div>
    </div>
  );
}
