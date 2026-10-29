import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getClinic } from "@/lib/clinic";
import { loadHomeCare } from "@/lib/actions/documents";
import { docDate, docLocale, getDocT } from "@/lib/documents";
import { PrintToolbar } from "@/components/print/PrintToolbar";
import { DocField, DocHeader } from "@/components/print/DocHeader";

// Instructions for the owner after a visit: what to do at home, medications, next vaccines
export default async function HomeCarePrint({ params, searchParams }: { params: { id: string }; searchParams: { lang?: string } }) {
  const [data, clinic] = await Promise.all([loadHomeCare(params.id), getClinic()]);
  if (!data) notFound();
  const locale = docLocale(searchParams.lang, clinic.dataLocale);
  const t = await getDocT(locale);
  const tp = await getTranslations({ locale, namespace: "patients" });
  const diagnosis = data.diagnosis || data.presumptiveDiagnosis;

  return (
    <>
      <PrintToolbar lang={locale} />
      <main className="doc-page mx-auto max-w-[210mm] bg-white p-8 my-4 shadow-sm">
        <DocHeader clinic={clinic} title={t("homeCareTitle")} subtitle={docDate(data.date, locale)} />

        <section className="grid grid-cols-2 gap-x-8 gap-y-1 mb-6">
          <div>
            <DocField label={t("patient")} value={data.pet.name} />
            <DocField label={t("species")} value={[tp(data.pet.species.toLowerCase()), data.pet.breed].filter(Boolean).join(" · ")} />
            <DocField label={t("weight")} value={data.weight ? `${data.weight} kg` : null} />
          </div>
          <div>
            <DocField label={t("owner")} value={`${data.pet.owner.firstName} ${data.pet.owner.lastName}`} />
            <DocField label={t("phone")} value={data.pet.owner.phone} />
            <DocField label={t("veterinarian")} value={data.veterinarian.name} />
          </div>
        </section>

        {diagnosis && (
          <section className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-1">{t("diagnosis")}</h2>
            <p className="text-[13px] whitespace-pre-line">{diagnosis}</p>
          </section>
        )}

        <section className="mb-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-1">{t("homeCareInstructions")}</h2>
          <div className="rounded-lg border-2 border-neutral-800 p-4 text-[14px] leading-relaxed whitespace-pre-line min-h-[80px]">
            {data.homeCare || data.treatment || t("homeCareEmpty")}
          </div>
        </section>

        {data.medications.length > 0 && (
          <section className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-1">{t("medications")}</h2>
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-neutral-400 text-left">
                  <th className="py-1.5 pr-4 font-medium w-2/5">{t("medication")}</th>
                  <th className="py-1.5 font-medium">{t("howToGive")}</th>
                </tr>
              </thead>
              <tbody>
                {data.medications.map((m, i) => (
                  <tr key={i} className="border-b border-neutral-200 align-top">
                    <td className="py-1.5 pr-4 font-medium">{m.name}</td>
                    <td className="py-1.5">{m.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {data.pet.vaccinations.length > 0 && (
          <section className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-1">{t("nextVaccines")}</h2>
            <ul className="text-[13px] space-y-0.5">
              {data.pet.vaccinations.map((v, i) => (
                <li key={i}>{v.vaccineName}: <span className="font-medium">{docDate(v.nextDueDate!, locale)}</span></li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-10 pt-4 border-t border-neutral-300 flex items-end justify-between gap-8 text-[12px] text-neutral-600">
          <p className="max-w-[60%]">{clinic.phone ? t("homeCareFooter", { phone: clinic.phone }) : ""}</p>
          <div className="text-center">
            <div className="w-48 border-b border-neutral-500 h-10" />
            <p className="mt-1">{data.veterinarian.name}</p>
          </div>
        </footer>
      </main>
    </>
  );
}
