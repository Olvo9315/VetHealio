import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getPetById } from "@/lib/actions/patients";
import { TopBar } from "@/components/layout/TopBar";
import { PetDetailTabs } from "@/components/patients/PetDetailTabs";
import { PetDetailHeader } from "@/components/patients/PetDetailHeader";
import { getOwnerDebt } from "@/lib/actions/billing";
import { getConsentStatus } from "@/lib/actions/consents";

interface PageProps {
  params: { id: string };
  searchParams: { appointment?: string };
}

export default async function PatientDetailPage({ params, searchParams }: PageProps) {
  const [session, pet] = await Promise.all([auth(), getPetById(params.id)]);

  if (!pet) notFound();
  const [debt, consent] = await Promise.all([getOwnerDebt(pet.owner.id), getConsentStatus(pet.owner.id)]);

  return (
    <div className="flex flex-col min-h-full">
      <TopBar
        user={session?.user ?? {}}
        title={`${pet.name} · ${pet.owner.firstName} ${pet.owner.lastName}`}
      />
      <div className="flex-1 p-4 md:p-6 space-y-4 max-w-4xl mx-auto w-full">
        <PetDetailHeader pet={pet} debt={debt.total} consent={consent} />
        <PetDetailTabs pet={pet} initialAppointmentId={searchParams.appointment} />
      </div>
    </div>
  );
}
