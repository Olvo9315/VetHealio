// Server only (database, translations, PDF building)
import { endOfDay, startOfDay } from "date-fns";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getClinic } from "@/lib/clinic";
import { docNumber, type DocLine, type TaxRow } from "@/lib/billing";
import { buildBookPdf, type BookPdfDoc } from "@/lib/book-pdf";
import { toCsv } from "@/lib/format";

const LABELS = [
  "bookTitle", "generated", "summary", "docsSimplified", "docsFull", "docsRectifying", "docsReplaced", "vat", "vatShort",
  "taxBase", "taxAmount", "total", "noteReplaced", "noteRectifying", "register", "number", "date", "customer",
  "replacedBy", "replaces", "rectifies", "fullInvoice", "rectifyingInvoice", "simplifiedInvoice", "issueDate", "reason",
  "description", "qty", "price", "amount", "docType", "period",
] as const;

// Everything the adviser gets for a period, in the clinic's data language: PDF (summary, register
// and, if asked, every invoice) and CSV of the register for their accounting software
export async function buildAdviserPackage(fromDay: string, toDay: string, includeInvoices: boolean) {
  const from = startOfDay(new Date(`${fromDay}T12:00:00`));
  const to = endOfDay(new Date(`${toDay}T12:00:00`));
  const clinic = await getClinic();
  const t = await getTranslations({ locale: clinic.dataLocale, namespace: "adviser" });
  const l = Object.fromEntries(LABELS.map((k) => [k, t(k)])) as Record<string, string>;

  const rows = await prisma.fiscalDocument.findMany({
    where: { issuedAt: { gte: from, lte: to } },
    include: {
      replacedBy: { select: { series: true, year: true, number: true, kind: true } },
      replaces: { select: { series: true, year: true, number: true } },
    },
    orderBy: [{ series: "asc" }, { year: "asc" }, { number: "asc" }],
  });
  const docs: BookPdfDoc[] = rows.map((d) => {
    const replacement = d.replacedBy.find((r) => r.kind === "FULL");
    return {
      docNumber: docNumber(d),
      kind: d.kind,
      issuedAt: d.issuedAt,
      customerName: d.customerName,
      customerNif: d.customerNif,
      customerAddress: d.customerAddress,
      lines: d.lines as DocLine[],
      taxBreakdown: d.taxBreakdown as TaxRow[],
      taxBase: d.taxBase,
      taxAmount: d.taxAmount,
      total: d.total,
      replacedBy: replacement ? docNumber(replacement) : null,
      replaces: d.replaces ? docNumber(d.replaces) : null,
      reason: d.reason,
    };
  });

  const fmt = (d: Date) => new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" }).format(d);
  const periodLabel = `${fmt(from)} – ${fmt(to)}`;
  const pdf = await buildBookPdf({
    clinic: {
      name: clinic.name,
      legalName: clinic.legalName,
      nif: clinic.nif,
      address: [clinic.address, [clinic.postalCode, clinic.city].filter(Boolean).join(" "), clinic.province].filter(Boolean).join(", "),
      contact: [clinic.phone, clinic.email].filter(Boolean).join(" · "),
    },
    periodLabel,
    generatedAt: new Date(),
    docs,
    includeInvoices,
    l,
  });

  // Register as CSV: one column pair per VAT rate, Spanish decimal comma for Excel in Spain
  const rates = Array.from(new Set(docs.flatMap((d) => d.taxBreakdown.map((r) => r.rate)))).sort((a, b) => b - a);
  const n = (v: number) => v.toFixed(2).replace(".", ",");
  const kindLabel = { SIMPLIFIED: l.simplifiedInvoice, FULL: l.fullInvoice, RECTIFYING: l.rectifyingInvoice };
  const csv = toCsv([
    [l.number, l.docType, l.date, l.customer, "NIF", ...rates.flatMap((r) => [`${l.taxBase} ${r}%`, `${l.vatShort} ${r}%`]), l.taxBase, l.vatShort, l.total, l.reason],
    ...docs.map((d) => [
      d.docNumber,
      kindLabel[d.kind],
      fmt(d.issuedAt),
      d.customerName,
      d.customerNif ?? "",
      ...rates.flatMap((rate) => {
        const x = d.taxBreakdown.find((b) => b.rate === rate);
        return [x ? n(x.base) : "", x ? n(x.tax) : ""];
      }),
      n(d.taxBase),
      n(d.taxAmount),
      n(d.total),
      d.replacedBy ? `${l.replacedBy} ${d.replacedBy}` : d.replaces ? `${d.kind === "RECTIFYING" ? l.rectifies : l.replaces} ${d.replaces}` : "",
    ]),
  ]);

  const counted = docs.filter((d) => !d.replacedBy);
  const slug = (clinic.legalName || clinic.name).normalize("NFD").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "");
  return {
    pdf,
    csv,
    fileBase: `${slug}_${l.bookTitle.replace(/\s+/g, "_")}_${fromDay}_${toDay}`,
    periodLabel,
    clinic,
    docCount: docs.length,
    total: Math.round(counted.reduce((s, d) => s + d.total, 0) * 100) / 100,
    taxBase: Math.round(counted.reduce((s, d) => s + d.taxBase, 0) * 100) / 100,
    taxAmount: Math.round(counted.reduce((s, d) => s + d.taxAmount, 0) * 100) / 100,
    l,
  };
}
