"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/permissions";
import { getClinic } from "@/lib/clinic";
import { docDate, docLocale, getDocT, whatsappNumber } from "@/lib/documents";

export type HomeCareData = NonNullable<Awaited<ReturnType<typeof loadHomeCare>>>;

// Everything the owner's home-care sheet shows
export async function loadHomeCare(recordId: string) {
  await requireUserId();
  const record = await prisma.medicalRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      date: true,
      diagnosis: true,
      presumptiveDiagnosis: true,
      treatment: true,
      homeCare: true,
      weight: true,
      veterinarian: { select: { name: true } },
      pet: {
        select: {
          name: true,
          species: true,
          breed: true,
          owner: { select: { firstName: true, lastName: true, phone: true, email: true } },
          vaccinations: {
            where: { nextDueDate: { gte: new Date() } },
            select: { vaccineName: true, nextDueDate: true },
            orderBy: { nextDueDate: "asc" },
            take: 5,
          },
        },
      },
      prescriptions: {
        select: {
          medicationName: true,
          dosage: true,
          frequency: true,
          duration: true,
          items: { select: { medicationName: true, units: true, posology: true } },
        },
      },
    },
  });
  if (!record) return null;
  // One line per medication, whether typed in the record or written as a prescription
  const medications = record.prescriptions.flatMap((p) =>
    p.items.length
      ? p.items.map((i) => ({ name: `${i.medicationName}${i.units ? ` ${i.units}` : ""}`, how: i.posology }))
      : p.medicationName
        ? [{ name: p.medicationName, how: [p.dosage, p.frequency, p.duration].filter(Boolean).join(", ") }]
        : []
  );
  return { ...record, medications };
}

// Plain-text version of the sheet for WhatsApp / e-mail, in the chosen language
export async function getHomeCareMessage(recordId: string, lang?: string) {
  const data = await loadHomeCare(recordId);
  if (!data) return null;
  const clinic = await getClinic();
  const locale = docLocale(lang, clinic.dataLocale);
  const t = await getDocT(locale);
  const lines = [
    t("homeCareGreeting", { owner: data.pet.owner.firstName, pet: data.pet.name, date: docDate(data.date, locale) }),
    "",
  ];
  const diagnosis = data.diagnosis || data.presumptiveDiagnosis;
  if (diagnosis) lines.push(`${t("diagnosis")}: ${diagnosis}`, "");
  if (data.homeCare) lines.push(data.homeCare, "");
  if (data.medications.length) {
    lines.push(`${t("medications")}:`);
    for (const m of data.medications) lines.push(`• ${m.name}${m.how ? ` — ${m.how}` : ""}`);
    lines.push("");
  }
  if (data.pet.vaccinations.length) {
    lines.push(`${t("nextVaccines")}:`);
    for (const v of data.pet.vaccinations) lines.push(`• ${v.vaccineName}: ${docDate(v.nextDueDate!, locale)}`);
    lines.push("");
  }
  lines.push(clinic.phone ? `${clinic.name} · ${clinic.phone}` : clinic.name);
  return {
    text: lines.join("\n"),
    subject: t("homeCareSubject", { pet: data.pet.name, clinic: clinic.name }),
    whatsapp: data.pet.owner.phone ? whatsappNumber(data.pet.owner.phone) : null,
    email: data.pet.owner.email,
  };
}
