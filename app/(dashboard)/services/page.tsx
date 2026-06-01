import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/layout/TopBar";
import { getServiceTree } from "@/lib/actions/services";
import { ServicesManager } from "@/components/services/ServicesManager";

export default async function ServicesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const t = await getTranslations("services");
  const tree = await getServiceTree();

  return (
    <div className="flex flex-col h-full">
      <TopBar user={session?.user ?? {}} title={t("title")} />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-3xl mx-auto w-full">
        <ServicesManager initialTree={tree} />
      </div>
    </div>
  );
}
