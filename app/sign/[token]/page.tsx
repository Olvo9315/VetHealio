import { prisma } from "@/lib/prisma";
import { getClinic } from "@/lib/clinic";
import { docDate, docLocale, getDocT } from "@/lib/documents";
import { getSignStatus } from "@/lib/actions/public-sign";
import { RemoteSignForm } from "@/components/patients/RemoteSignForm";

export const dynamic = "force-dynamic";

// Page the customer opens from WhatsApp or e-mail to read and sign a document on their own phone.
// No account needed; it only shows the one document behind the private link.
export default async function SignPage({ params }: { params: { token: string } }) {
  const [status, clinic] = await Promise.all([getSignStatus(params.token), getClinic()]);
  const request =
    status === "notFound"
      ? null
      : await prisma.consentRequest.findUnique({
          where: { token: params.token },
          select: { kind: true, text: true, lang: true, expiresAt: true, signedAt: true, owner: { select: { firstName: true, lastName: true } } },
        });
  const locale = docLocale(request?.lang, clinic.dataLocale);
  const t = await getDocT(locale);
  const isRgpd = request?.kind === "rgpd";

  return (
    <div className="print-doc">
      <main className="mx-auto max-w-xl px-4 py-6 space-y-4">
        <header className="flex items-center gap-3 border-b border-neutral-200 pb-3">
          {clinic.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clinic.logoUrl} alt="" className="h-10 w-10 object-contain" />
          )}
          <div>
            <p className="font-semibold">{clinic.name}</p>
            <p className="text-xs text-neutral-500">{[clinic.phone, clinic.email].filter(Boolean).join(" · ")}</p>
          </div>
        </header>

        {status === "notFound" && <p className="text-sm">{t("signLinkInvalid")}</p>}
        {status === "expired" && <p className="text-sm">{t("signLinkExpired", { phone: clinic.phone ?? "" })}</p>}
        {status === "signed" && request?.signedAt && (
          <p className="text-sm rounded-lg bg-emerald-50 text-emerald-800 p-3">{t("signLinkDone", { date: docDate(request.signedAt, locale, true) })}</p>
        )}

        {status === "open" && request && (
          <>
            <div>
              <h1 className="text-lg font-bold">{isRgpd ? t("consentTitle") : t(`consentKind_${request.kind}`)}</h1>
              <p className="text-sm text-neutral-600">{request.owner.firstName} {request.owner.lastName}</p>
            </div>
            <RemoteSignForm
              token={params.token}
              text={request.text}
              optional={isRgpd}
              labels={{
                accept: isRgpd ? t("signAcceptData") : t("signAcceptTreatment"),
                reminders: t("signReminders"),
                marketing: t("signMarketing"),
                signHere: t("signHere"),
                clear: t("signClear"),
                submit: t("signSubmit"),
                done: t("signThanks"),
                error: t("signError"),
                expires: t("signExpires", { date: docDate(request.expiresAt, locale) }),
              }}
            />
          </>
        )}
      </main>
    </div>
  );
}
