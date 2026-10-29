import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { TopBar } from "@/components/layout/TopBar";
import { getOwnerOverview } from "@/lib/actions/patients";
import { getOwnerDebt } from "@/lib/actions/billing";
import { getConsentStatus, getOwnerDocuments } from "@/lib/actions/consents";
import { OwnerOverview } from "@/components/patients/OwnerOverview";
import { findDuplicatesOf } from "@/lib/actions/owners";

// One owner and everything of theirs: pets, bills and debt, signed documents
export default async function OwnerPage({ params }: { params: { id: string } }) {
  const [session, data] = await Promise.all([auth(), getOwnerOverview(params.id)]);
  if (!data) notFound();
  const [debt, consent, documents, duplicates] = await Promise.all([
    getOwnerDebt(params.id),
    getConsentStatus(params.id),
    getOwnerDocuments(params.id),
    findDuplicatesOf(params.id),
  ]);
  return (
    <div className="flex flex-col min-h-full">
      <TopBar user={session?.user ?? {}} title={`${data.owner.firstName} ${data.owner.lastName}`} />
      <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
        <OwnerOverview owner={data.owner} bills={data.bills} debt={debt.total} consent={consent} documents={documents} duplicates={duplicates} />
      </div>
    </div>
  );
}
