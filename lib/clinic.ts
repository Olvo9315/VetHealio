import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { fileUrl } from "@/lib/storage";

export type ClinicInfo = {
  name: string;
  legalName: string | null;
  nif: string | null;
  registrationNumber: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  iban: string | null;
  defaultTaxRate: number;
  // Prices are entered with VAT included (true) or before VAT (false)
  pricesIncludeTax: boolean;
  invoiceFooter: string | null;
  dataLocale: "es" | "ru" | "en";
};

// One read per request; creates the singleton row on first use
export const getClinic = cache(async (): Promise<ClinicInfo> => {
  const s = await prisma.clinicSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  return {
    name: s.name,
    legalName: s.legalName,
    nif: s.nif,
    registrationNumber: s.registrationNumber,
    address: s.address,
    postalCode: s.postalCode,
    city: s.city,
    province: s.province,
    country: s.country,
    phone: s.phone,
    email: s.email,
    website: s.website,
    // updatedAt busts browser caches after a logo change
    logoUrl: s.logoKey ? `${fileUrl(s.logoKey)}?v=${s.updatedAt.getTime()}` : null,
    iban: s.iban,
    defaultTaxRate: s.defaultTaxRate,
    pricesIncludeTax: s.pricesIncludeTax,
    invoiceFooter: s.invoiceFooter,
    dataLocale: (["es", "ru", "en"].includes(s.dataLocale) ? s.dataLocale : "es") as ClinicInfo["dataLocale"],
  };
});
