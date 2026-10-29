"use server";

import { revalidatePath } from "next/cache";
import { addDays, endOfDay, startOfDay, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/permissions";
import { getClinic } from "@/lib/clinic";
import { docDate, docLocale, getDocT, whatsappNumber } from "@/lib/documents";

export type ReminderRow = {
  kind: "vaccine" | "appointment";
  id: string;
  date: Date;
  label: string;
  petId: string;
  petName: string;
  ownerName: string;
  phone: string;
  consent: boolean;
  sentAt: Date | null;
};

// Who should be reminded: vaccines due (or overdue up to a month) and appointments in the next days.
// For vaccines only the latest shot of each vaccine of each pet counts.
export async function getReminders(days = 30): Promise<ReminderRow[]> {
  await requireUserId();
  const now = new Date();
  const [vaccines, appointments] = await Promise.all([
    prisma.vaccination.findMany({
      where: { nextDueDate: { gte: startOfDay(subDays(now, 30)), lte: endOfDay(addDays(now, days)) }, pet: { isActive: true } },
      select: {
        id: true,
        vaccineName: true,
        nextDueDate: true,
        dateAdministered: true,
        reminderSentAt: true,
        pet: {
          select: {
            id: true,
            name: true,
            owner: { select: { firstName: true, lastName: true, phone: true, remindersConsent: true } },
            vaccinations: { select: { vaccineName: true, dateAdministered: true }, orderBy: { dateAdministered: "desc" } },
          },
        },
      },
      orderBy: { nextDueDate: "asc" },
    }),
    prisma.appointment.findMany({
      where: { startTime: { gte: now, lte: endOfDay(addDays(now, 2)) }, status: "SCHEDULED" },
      select: {
        id: true,
        title: true,
        startTime: true,
        reminderSentAt: true,
        pet: { select: { id: true, name: true, owner: { select: { firstName: true, lastName: true, phone: true, remindersConsent: true } } } },
      },
      orderBy: { startTime: "asc" },
    }),
  ]);
  // A vaccine given again since this shot is no longer due
  const latest = vaccines.filter((v) => {
    const key = v.vaccineName.trim().toLowerCase();
    const newest = v.pet.vaccinations.find((x) => x.vaccineName.trim().toLowerCase() === key);
    return !newest || newest.dateAdministered <= v.dateAdministered;
  });
  return [
    ...appointments.map((a) => ({
      kind: "appointment" as const,
      id: a.id,
      date: a.startTime,
      label: a.title,
      petId: a.pet.id,
      petName: a.pet.name,
      ownerName: `${a.pet.owner.firstName} ${a.pet.owner.lastName}`,
      phone: a.pet.owner.phone,
      consent: a.pet.owner.remindersConsent,
      sentAt: a.reminderSentAt,
    })),
    ...latest.map((v) => ({
      kind: "vaccine" as const,
      id: v.id,
      date: v.nextDueDate!,
      label: v.vaccineName,
      petId: v.pet.id,
      petName: v.pet.name,
      ownerName: `${v.pet.owner.firstName} ${v.pet.owner.lastName}`,
      phone: v.pet.owner.phone,
      consent: v.pet.owner.remindersConsent,
      sentAt: v.reminderSentAt,
    })),
  ];
}

// Ready-to-send WhatsApp text in the owner's language
export async function getReminderMessage(kind: "vaccine" | "appointment", id: string, lang?: string) {
  await requireUserId();
  const clinic = await getClinic();
  const locale = docLocale(lang, clinic.dataLocale);
  const t = await getDocT(locale);
  const contact = clinic.phone ? `${clinic.name} · ${clinic.phone}` : clinic.name;
  if (kind === "vaccine") {
    const v = await prisma.vaccination.findUnique({
      where: { id },
      select: { vaccineName: true, nextDueDate: true, pet: { select: { name: true, owner: { select: { firstName: true, phone: true } } } } },
    });
    if (!v) return null;
    return {
      whatsapp: whatsappNumber(v.pet.owner.phone),
      text: t("reminderVaccine", {
        owner: v.pet.owner.firstName,
        pet: v.pet.name,
        vaccine: v.vaccineName,
        date: docDate(v.nextDueDate!, locale),
        contact,
      }),
    };
  }
  const a = await prisma.appointment.findUnique({
    where: { id },
    select: { startTime: true, pet: { select: { name: true, owner: { select: { firstName: true, phone: true } } } } },
  });
  if (!a) return null;
  const time = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(a.startTime);
  return {
    whatsapp: whatsappNumber(a.pet.owner.phone),
    text: t("reminderAppointment", {
      owner: a.pet.owner.firstName,
      pet: a.pet.name,
      date: docDate(a.startTime, locale),
      time,
      contact,
    }),
  };
}

export async function markReminderSent(kind: "vaccine" | "appointment", id: string, sent = true) {
  await requireUserId();
  const data = { reminderSentAt: sent ? new Date() : null };
  if (kind === "vaccine") await prisma.vaccination.update({ where: { id }, data });
  else await prisma.appointment.update({ where: { id }, data });
  revalidatePath("/reminders");
}
