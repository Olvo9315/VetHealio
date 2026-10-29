import type { ClinicInfo } from "@/lib/clinic";

// Clinic letterhead of printed documents
export function DocHeader({ clinic, title, subtitle }: { clinic: ClinicInfo; title: string; subtitle?: string }) {
  const address = [clinic.address, [clinic.postalCode, clinic.city].filter(Boolean).join(" "), clinic.province]
    .filter(Boolean)
    .join(", ");
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-neutral-800 pb-4 mb-6">
      <div className="flex items-start gap-3">
        {clinic.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clinic.logoUrl} alt="" className="h-14 w-14 object-contain" />
        )}
        <div className="text-[11px] leading-snug text-neutral-700">
          <p className="text-base font-bold text-neutral-900">{clinic.legalName || clinic.name}</p>
          {clinic.legalName && clinic.legalName !== clinic.name && <p>{clinic.name}</p>}
          {clinic.nif && <p>NIF: {clinic.nif}</p>}
          {address && <p>{address}</p>}
          <p>{[clinic.phone, clinic.email, clinic.website].filter(Boolean).join(" · ")}</p>
          {clinic.registrationNumber && <p>{clinic.registrationNumber}</p>}
        </div>
      </div>
      <div className="text-right">
        <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-600 mt-0.5">{subtitle}</p>}
      </div>
    </header>
  );
}

export function DocField({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <p className="text-[12px]">
      <span className="text-neutral-500">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  );
}
