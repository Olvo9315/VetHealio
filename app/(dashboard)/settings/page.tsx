import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { getUserById } from "@/lib/actions/settings";
import { ProfileCard } from "@/components/settings/ProfileCard";
import { PasswordCard } from "@/components/settings/PasswordCard";
import { PreferencesCard } from "@/components/settings/PreferencesCard";

export default async function SettingsPage() {
  const session = await auth();
  const t = await getTranslations("settings");

  const userId = (session?.user as { id?: string })?.id;
  if (!userId) redirect("/login");

  const user = await getUserById(userId);
  if (!user) redirect("/login");

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Profile + Preferences side by side on md+ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ProfileCard user={user} />
            <PreferencesCard
              userId={user.id}
              initialLanguage={user.language}
              initialTheme={user.theme}
            />
          </div>

          {/* Password full width */}
          <PasswordCard userId={user.id} />
        </div>
      </div>
    </div>
  );
}
