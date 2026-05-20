import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function AppointmentsPage() {
  const session = await auth();
  const t = await getTranslations("appointments");

  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 p-4 md:p-6">
        <div className="flex justify-end mb-4">
          <Button className="bg-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" />
            {t("new")}
          </Button>
        </div>
        <div className="text-center text-muted-foreground py-20">
          Calendario próximamente
        </div>
      </div>
    </div>
  );
}
