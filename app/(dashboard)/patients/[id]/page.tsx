import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { getPetById } from "@/lib/actions/patients";
import { TopBar } from "@/components/layout/TopBar";
import { PetDetailTabs } from "@/components/patients/PetDetailTabs";
import { PetDetailHeader } from "@/components/patients/PetDetailHeader";

interface PageProps {
  params: { id: string };
}

export default async function PatientDetailPage({ params }: PageProps) {
  const [session, pet] = await Promise.all([auth(), getPetById(params.id)]);

  if (!pet) notFound();

  return (
    <div className="flex flex-col min-h-full">
      <TopBar
        user={session?.user ?? {}}
        title={`${pet.name} · ${pet.owner.firstName} ${pet.owner.lastName}`}
      />
      <div className="flex-1 p-4 md:p-6 space-y-4 max-w-4xl mx-auto w-full">
        <PetDetailHeader pet={pet} />
        <PetDetailTabs pet={pet} />
      </div>
    </div>
  );
}
