import { prisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/license";

// Day boundaries are computed in the clinic's timezone, not the server's (Vercel runs in UTC)
export const TIMEZONE = "Europe/Madrid";
const DAY = 24 * 60 * 60 * 1000;

function tzOffsetMs(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - date.getTime();
}

// Calendar date (YYYY-MM-DD) of an instant in the clinic timezone
export function localDateKey(date: Date) {
  return new Date(date.getTime() + tzOffsetMs(date)).toISOString().slice(0, 10);
}

// UTC instant of local midnight for a YYYY-MM-DD key
function startOfLocalDay(key: string) {
  const guess = new Date(`${key}T00:00:00Z`);
  return new Date(guess.getTime() - tzOffsetMs(guess));
}

function addDays(key: string, days: number) {
  return new Date(new Date(`${key}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
}

function trend(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function sumPaid(rows: { amount: number }[]) {
  return rows.reduce((sum, r) => sum + r.amount, 0);
}

export async function getDashboardData() {
  const now = new Date();
  const todayKey = localDateKey(now);
  const todayStart = startOfLocalDay(todayKey);
  const tomorrowStart = startOfLocalDay(addDays(todayKey, 1));
  const weekAgoStart = startOfLocalDay(addDays(todayKey, -7));
  const weekAgoEnd = startOfLocalDay(addDays(todayKey, -6));

  // Month-to-date vs the same number of days of the previous month
  const [y, m, d] = todayKey.split("-").map(Number);
  const monthStart = startOfLocalDay(`${todayKey.slice(0, 8)}01`);
  const prevMonth = new Date(Date.UTC(y, m - 2, 1));
  const prevMonthKey = prevMonth.toISOString().slice(0, 8);
  const prevMonthDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const prevMonthStart = startOfLocalDay(`${prevMonthKey}01`);
  const prevMonthSameDay = startOfLocalDay(
    addDays(`${prevMonthKey}${String(Math.min(d, prevMonthDays)).padStart(2, "0")}`, 1)
  );

  const chartStart = startOfLocalDay(addDays(todayKey, -29));
  const inventoryEnabled = await isModuleEnabled("inventory");
  const activeStatus = { notIn: ["CANCELLED", "NO_SHOW"] as ("CANCELLED" | "NO_SHOW")[] };

  const [
    todayAppointments,
    weekAgoAppointments,
    paidLast30,
    monthPaid,
    prevMonthPaid,
    newPatients,
    prevNewPatients,
    upcoming,
    stockItems,
    vaccinations,
    unpaid,
    expiringLots,
    waiting,
  ] = await Promise.all([
    prisma.appointment.count({
      where: { startTime: { gte: todayStart, lt: tomorrowStart }, status: activeStatus },
    }),
    prisma.appointment.count({
      where: { startTime: { gte: weekAgoStart, lt: weekAgoEnd }, status: activeStatus },
    }),
    prisma.payment.findMany({
      where: { paidAt: { gte: chartStart }, voidedAt: null, invoice: { status: { not: "CANCELLED" } } },
      select: { amount: true, paidAt: true },
    }),
    prisma.payment.findMany({
      where: { paidAt: { gte: monthStart }, voidedAt: null, invoice: { status: { not: "CANCELLED" } } },
      select: { amount: true },
    }),
    prisma.payment.findMany({
      where: { paidAt: { gte: prevMonthStart, lt: prevMonthSameDay }, voidedAt: null, invoice: { status: { not: "CANCELLED" } } },
      select: { amount: true },
    }),
    prisma.pet.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.pet.count({ where: { createdAt: { gte: prevMonthStart, lt: prevMonthSameDay } } }),
    prisma.appointment.findMany({
      where: { startTime: { gte: now }, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      orderBy: { startTime: "asc" },
      take: 5,
      select: {
        id: true,
        startTime: true,
        status: true,
        pet: { select: { name: true, owner: { select: { lastName: true } } } },
      },
    }),
    prisma.inventoryItem.findMany({
      where: inventoryEnabled ? { minStock: { gt: 0 } } : { id: "" },
      select: { id: true, name: true, quantity: true, unit: true, minStock: true },
    }),
    prisma.vaccination.findMany({
      where: { nextDueDate: { gte: startOfLocalDay(addDays(todayKey, -30)), lt: startOfLocalDay(addDays(todayKey, 15)) } },
      orderBy: { nextDueDate: "asc" },
      take: 5,
      select: { id: true, vaccineName: true, nextDueDate: true, pet: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: { status: "PENDING" },
      select: { totalAmount: true, paidAmount: true, petId: true, pet: { select: { ownerId: true, owner: { select: { firstName: true, lastName: true } } } } },
    }),
    prisma.inventoryBatch.findMany({
      where: inventoryEnabled
        ? { quantity: { gt: 0 }, expiryDate: { lt: startOfLocalDay(addDays(todayKey, 60)) } }
        : { id: "" },
      orderBy: { expiryDate: "asc" },
      take: 6,
      select: { id: true, lot: true, expiryDate: true, quantity: true, item: { select: { name: true, unit: true } } },
    }),
    prisma.appointment.count({ where: { status: "ARRIVED" } }),
  ]);

  // Owners with money owed, largest first
  const owed = new Map<string, { name: string; petId: string; amount: number }>();
  for (const inv of unpaid) {
    const due = inv.totalAmount - inv.paidAmount;
    if (due <= 0.005) continue;
    const cur = owed.get(inv.pet.ownerId) ?? { name: `${inv.pet.owner.firstName} ${inv.pet.owner.lastName}`, petId: inv.petId, amount: 0 };
    owed.set(inv.pet.ownerId, { ...cur, amount: Math.round((cur.amount + due) * 100) / 100 });
  }
  const debts = Array.from(owed.values()).sort((a, b) => b.amount - a.amount);

  // Daily revenue series for the chart
  const byDay = new Map<string, number>();
  for (const p of paidLast30) {
    const key = localDateKey(p.paidAt);
    byDay.set(key, (byDay.get(key) ?? 0) + p.amount);
  }
  const revenueSeries = Array.from({ length: 30 }, (_, i) => {
    const key = addDays(todayKey, i - 29);
    return { date: `${key.slice(8, 10)}/${key.slice(5, 7)}`, revenue: Math.round((byDay.get(key) ?? 0) * 100) / 100 };
  });

  const todayRevenue = byDay.get(todayKey) ?? 0;
  const weekAgoRevenue = byDay.get(addDays(todayKey, -7)) ?? 0;
  const monthRevenue = sumPaid(monthPaid);

  return {
    todayAppointments: { value: todayAppointments, trend: trend(todayAppointments, weekAgoAppointments) },
    todayRevenue: { value: todayRevenue, trend: trend(todayRevenue, weekAgoRevenue) },
    monthRevenue: { value: monthRevenue, trend: trend(monthRevenue, sumPaid(prevMonthPaid)) },
    newPatients: { value: newPatients, trend: trend(newPatients, prevNewPatients) },
    revenueSeries,
    upcoming: upcoming.map((a) => ({
      id: a.id,
      dateKey: localDateKey(a.startTime),
      isToday: localDateKey(a.startTime) === todayKey,
      startTime: a.startTime,
      status: a.status,
      petName: a.pet.name,
      ownerName: a.pet.owner.lastName,
    })),
    inventoryEnabled,
    waiting,
    debts: { total: Math.round(debts.reduce((s, d) => s + d.amount, 0) * 100) / 100, count: debts.length, top: debts.slice(0, 5) },
    expiringLots: expiringLots.map((b) => ({
      id: b.id,
      name: b.item.name,
      lot: b.lot,
      quantity: b.quantity,
      unit: b.item.unit,
      expired: !!b.expiryDate && b.expiryDate < now,
      expiryDate: b.expiryDate,
    })),
    lowStock: stockItems
      .filter((i) => i.quantity <= i.minStock)
      .sort((a, b) => a.quantity / a.minStock - b.quantity / b.minStock)
      .slice(0, 5),
    vaccinations: vaccinations.map((v) => ({
      id: v.id,
      petName: v.pet.name,
      vaccineName: v.vaccineName,
      // Whole days from today; negative = overdue
      daysUntil: Math.round(
        (startOfLocalDay(localDateKey(v.nextDueDate!)).getTime() - todayStart.getTime()) / DAY
      ),
    })),
  };
}
