import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";

export default async function PatientsPage() {
  const session = await auth();
  const t = await getTranslations("patients");

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={t("search")} className="pl-9" />
          </div>
          <Button className="bg-primary text-primary-foreground shrink-0">
            <Plus className="w-4 h-4 mr-2" />
            {t("newPatient")}
          </Button>
        </div>
        <div className="text-center text-muted-foreground py-20">{t("noPatients")}</div>
      </div>
    </div>
  );
}
