"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Printer } from "lucide-react";

const LANGS = [
  { id: "es", label: "ES" },
  { id: "ru", label: "RU" },
  { id: "en", label: "EN" },
];

// Bar above a printable document (hidden when printing): language of the document, print / save as PDF.
// Official documents pass no `lang`: they are always in Spanish and show no language choice.
export function PrintToolbar({ lang, children }: { lang?: string; children?: React.ReactNode }) {
  const t = useTranslations("documentsUi");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setLang(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("lang", id);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="print:hidden sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-[210mm] flex flex-wrap items-center gap-2 px-4 py-2">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : window.close())}
          className="h-9 px-3 rounded-md border border-neutral-300 text-sm flex items-center gap-1.5 hover:bg-neutral-100"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("back")}
        </button>
        {lang ? (
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-neutral-500 mr-1">{t("language")}</span>
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLang(l.id)}
              className={
                "h-8 w-10 rounded-md text-xs font-medium border " +
                (lang === l.id ? "bg-neutral-900 text-white border-neutral-900" : "border-neutral-300 hover:bg-neutral-100")
              }
            >
              {l.label}
            </button>
          ))}
        </div>
        ) : (
          <div className="ml-auto" />
        )}
        {children}
        <button
          type="button"
          onClick={() => window.print()}
          className="h-9 px-4 rounded-md bg-neutral-900 text-white text-sm flex items-center gap-1.5 hover:bg-neutral-700"
        >
          <Printer className="w-4 h-4" />
          {t("print")}
        </button>
      </div>
    </div>
  );
}
