import { useTranslations } from "next-intl";
import { FlaskConical } from "lucide-react";

// Shown on clinic test deployments (Vercel Preview + staging DB) so nobody mistakes them for production
export function StagingBanner() {
  const t = useTranslations("release");
  return (
    <div className="print:hidden flex items-center justify-center gap-2 bg-amber-400 text-amber-950 text-xs font-medium px-3 py-1 shrink-0">
      <FlaskConical className="w-3.5 h-3.5" />
      <span>{t("stagingBanner", { version: process.env.NEXT_PUBLIC_APP_VERSION ?? "" })}</span>
    </div>
  );
}
