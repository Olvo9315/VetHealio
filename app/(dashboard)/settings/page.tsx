import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { getUserById } from "@/lib/actions/settings";
import { ProfileCard } from "@/components/settings/ProfileCard";
import { PasswordCard } from "@/components/settings/PasswordCard";
import { PreferencesCard } from "@/components/settings/PreferencesCard";
import { ClinicCard } from "@/components/settings/ClinicCard";
import { getClinic } from "@/lib/clinic";
import Link from "next/link";
import { ModulesCard } from "@/components/settings/ModulesCard";
import { getLicenseState } from "@/lib/license";
import { MODULES } from "@/lib/modules";
import { RoomsCard } from "@/components/settings/RoomsCard";
import { InstallAppCard } from "@/components/settings/InstallAppCard";
import { getRooms } from "@/lib/actions/rooms";
import { can } from "@/lib/permissions";
import { Database, ChevronRight } from "lucide-react";

export default async function SettingsPage() {
  const session = await auth();
  const t = await getTranslations("settings");
  const tData = await getTranslations("dataTransfer");

  const userId = (session?.user as { id?: string })?.id;
  if (!userId) redirect("/login");

  const user = await getUserById(userId);
  if (!user) redirect("/login");

  const clinic = user.role === "ADMIN" ? await getClinic() : null;
  const license = clinic ? await getLicenseState() : null;
  const rooms = (await can("rooms.manage")) ? await getRooms(true) : null;
  const moduleRows = MODULES.map((m) => ({
    key: m.key,
    enabled: !m.planned && !!license?.modules.includes(m.key),
    planned: !!m.planned,
  }));

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

          <InstallAppCard />

          {/* Clinic identity — admin only */}
          {clinic && <ClinicCard clinic={clinic} />}

          {/* Rooms — admin and head vet */}
          {rooms && <RoomsCard rooms={rooms} />}

          {/* Modules / license — admin only */}
          {license && (
            <ModulesCard
              modules={moduleRows}
              licenseStatus={license.status}
              expiresAt={"license" in license ? license.license?.expiresAt : undefined}
            />
          )}

          {/* Import / export — admin only */}
          {clinic && (
            <Link
              href="/settings/data"
              className="flex items-center gap-3 bg-card border border-border rounded-xl p-5 hover:bg-muted/40 transition-colors"
            >
              <Database className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-semibold">{tData("title")}</p>
                <p className="text-xs text-muted-foreground">{tData("subtitle")}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          )}

          <p className="text-center text-xs text-muted-foreground pt-2">
            VetHealio {process.env.NEXT_PUBLIC_APP_VERSION}
          </p>
        </div>
      </div>
    </div>
  );
}
