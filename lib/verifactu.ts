import { createHash } from "crypto";
import type { InvoiceKind, Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { docNumber, type TaxRow } from "@/lib/billing";
import pkg from "@/package.json";

// VeriFactu (Real Decreto 1007/2023, Orden HAC/1177/2024): every fiscal document gets an invoicing
// record, chained to the previous one by a SHA-256 hash, and its printout carries a QR code the
// customer can check at the AEAT. This file builds the records, their XML and the QR; sending them
// to the AEAT is not switched on yet (it needs the clinic's certificate, see docs/VERIFACTU.md).

type Tx = Prisma.TransactionClient;

// Who makes the invoicing software (the "productor" of the declaración responsable)
export const PRODUCER = {
  name: process.env.VERIFACTU_PRODUCER_NAME ?? "",
  nif: process.env.VERIFACTU_PRODUCER_NIF ?? "",
  system: "VetHealio",
  // Two characters that identify the system at the producer
  systemId: "VH",
  version: pkg.version,
  installation: process.env.VERIFACTU_INSTALLATION ?? "1",
};

const QR_BASE = {
  test: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR",
  prod: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR",
};

const NS = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd";

// Spanish time with its offset: "29-10-2026" and "2026-10-29T12:30:05+01:00"
export function spainTime(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(d);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const offset = p.timeZoneName === "GMT" ? "+00:00" : p.timeZoneName.replace("GMT", "");
  return {
    date: `${p.day}-${p.month}-${p.year}`,
    iso: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`,
  };
}

const amount = (n: number) => n.toFixed(2);

// The hash of a "registro de alta", exactly as the AEAT's specification defines it
// (checked against its published example)
export function recordHash(r: {
  issuerNif: string;
  numSerie: string;
  issueDate: string;
  invoiceType: string;
  totalTax: string;
  totalAmount: string;
  prevHash: string | null;
  generatedAt: string;
}) {
  const input =
    `IDEmisorFactura=${r.issuerNif.trim()}&NumSerieFactura=${r.numSerie.trim()}&FechaExpedicionFactura=${r.issueDate}` +
    `&TipoFactura=${r.invoiceType}&CuotaTotal=${r.totalTax}&ImporteTotal=${r.totalAmount}` +
    `&Huella=${r.prevHash ?? ""}&FechaHoraHusoGenRegistro=${r.generatedAt}`;
  return createHash("sha256").update(input, "utf8").digest("hex").toUpperCase();
}

// F2 ticket · F1 full invoice · F3 full invoice that replaces a ticket · R5 rectifies a ticket · R1 rectifies an invoice
export function invoiceType(kind: InvoiceKind, replacesKind?: InvoiceKind | null) {
  if (kind === "SIMPLIFIED") return "F2";
  if (kind === "FULL") return replacesKind ? "F3" : "F1";
  return replacesKind === "SIMPLIFIED" ? "R5" : "R1";
}

export function qrUrl(env: string, r: { issuerNif: string; numSerie: string; issueDate: string; totalAmount: string }) {
  const q = new URLSearchParams({ nif: r.issuerNif, numserie: r.numSerie, fecha: r.issueDate, importe: r.totalAmount });
  return `${env === "prod" ? QR_BASE.prod : QR_BASE.test}?${q.toString()}`;
}

// QR as inline SVG (ISO/IEC 18004, error correction M, as the order asks)
export function qrSvg(url: string) {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0 });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const el = (name: string, value: string) => `<sum1:${name}>${esc(value)}</sum1:${name}>`;

type DocForRecord = {
  kind: InvoiceKind;
  series: string;
  year: number;
  number: number;
  issuedAt: Date;
  customerName: string;
  customerNif: string | null;
  lines: Prisma.JsonValue;
  taxBreakdown: Prisma.JsonValue;
  taxAmount: number;
  total: number;
  reason: string | null;
  replaces: { kind: InvoiceKind; series: string; year: number; number: number; issuedAt: Date } | null;
};

// The <RegistroAlta> of one document. The envelope (Cabecera with the obligado) is added when sending.
export function registroAltaXml(
  doc: DocForRecord,
  r: { issuerNif: string; issuerName: string; numSerie: string; issueDate: string; invoiceType: string; totalTax: string; totalAmount: string; generatedAt: string; hash: string },
  prev: { issuerNif: string; numSerie: string; issueDate: string; hash: string } | null
) {
  const idFactura = (nif: string, num: string, date: string) => el("IDEmisorFactura", nif) + el("NumSerieFactura", num) + el("FechaExpedicionFactura", date);
  const replacedId = doc.replaces ? idFactura(r.issuerNif, docNumber(doc.replaces), spainTime(doc.replaces.issuedAt).date) : "";
  const lines = (doc.lines as { description: string }[] | null) ?? [];
  const description = (doc.reason || lines.map((l) => l.description).join(", ") || "Servicios veterinarios").slice(0, 500);
  const taxes = (doc.taxBreakdown as TaxRow[] | null) ?? [];
  const desglose = taxes
    .map((t) =>
      "<sum1:DetalleDesglose>" +
      el("Impuesto", "01") +
      el("ClaveRegimen", "01") +
      (t.rate > 0
        ? el("CalificacionOperacion", "S1") + el("TipoImpositivo", amount(t.rate)) + el("BaseImponibleOimporteNoSujeto", amount(t.base)) + el("CuotaRepercutida", amount(t.tax))
        : el("OperacionExenta", "E1") + el("BaseImponibleOimporteNoSujeto", amount(t.base))) +
      "</sum1:DetalleDesglose>"
    )
    .join("");
  const withCustomer = r.invoiceType !== "F2" && r.invoiceType !== "R5" && doc.customerNif;

  return (
    `<sum1:RegistroAlta xmlns:sum1="${NS}">` +
    el("IDVersion", "1.0") +
    `<sum1:IDFactura>${idFactura(r.issuerNif, r.numSerie, r.issueDate)}</sum1:IDFactura>` +
    el("NombreRazonEmisor", r.issuerName) +
    el("TipoFactura", r.invoiceType) +
    (r.invoiceType.startsWith("R")
      ? el("TipoRectificativa", "I") + `<sum1:FacturasRectificadas><sum1:IDFacturaRectificada>${replacedId}</sum1:IDFacturaRectificada></sum1:FacturasRectificadas>`
      : "") +
    (r.invoiceType === "F3" ? `<sum1:FacturasSustituidas><sum1:IDFacturaSustituida>${replacedId}</sum1:IDFacturaSustituida></sum1:FacturasSustituidas>` : "") +
    el("DescripcionOperacion", description) +
    (withCustomer
      ? `<sum1:Destinatarios><sum1:IDDestinatario>${el("NombreRazon", doc.customerName)}${el("NIF", doc.customerNif!)}</sum1:IDDestinatario></sum1:Destinatarios>`
      : "") +
    `<sum1:Desglose>${desglose}</sum1:Desglose>` +
    el("CuotaTotal", r.totalTax) +
    el("ImporteTotal", r.totalAmount) +
    "<sum1:Encadenamiento>" +
    (prev
      ? `<sum1:RegistroAnterior>${idFactura(prev.issuerNif, prev.numSerie, prev.issueDate)}${el("Huella", prev.hash)}</sum1:RegistroAnterior>`
      : el("PrimerRegistro", "S")) +
    "</sum1:Encadenamiento>" +
    "<sum1:SistemaInformatico>" +
    el("NombreRazon", PRODUCER.name) +
    el("NIF", PRODUCER.nif) +
    el("NombreSistemaInformatico", PRODUCER.system) +
    el("IdSistemaInformatico", PRODUCER.systemId) +
    el("Version", PRODUCER.version) +
    el("NumeroInstalacion", PRODUCER.installation) +
    el("TipoUsoPosibleSoloVerifactu", "S") +
    el("TipoUsoPosibleMultiOT", "N") +
    el("IndicadorMultiplesOT", "N") +
    "</sum1:SistemaInformatico>" +
    el("FechaHoraHusoGenRegistro", r.generatedAt) +
    el("TipoHuella", "01") +
    el("Huella", r.hash) +
    "</sum1:RegistroAlta>"
  );
}

// Makes the records of documents that have none yet, in issue order, each chained to the one before.
// Runs inside the transaction that issues a document (and once for documents issued earlier); the
// lock keeps two tills from adding to the chain at the same time. The issuer's NIF is part of every
// hash, so without it nothing is chained yet: the documents wait and are chained, in order, once it is set.
export async function chainPendingDocuments(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(1007202301)`;
  const docs = await tx.fiscalDocument.findMany({
    where: { verifactu: null },
    orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
    include: { replaces: { select: { kind: true, series: true, year: true, number: true, issuedAt: true } } },
  });
  if (!docs.length) return 0;
  const settings = await tx.clinicSettings.findUnique({ where: { id: "default" }, select: { nif: true, legalName: true, name: true } });
  const issuerNif = (settings?.nif ?? "").trim().toUpperCase();
  if (!issuerNif) return 0;
  const issuerName = settings?.legalName || settings?.name || "";
  let prev = await tx.verifactuRecord.findFirst({ orderBy: { seq: "desc" }, select: { seq: true, issuerNif: true, numSerie: true, issueDate: true, hash: true } });

  for (const doc of docs) {
    const base = {
      issuerNif,
      numSerie: docNumber(doc),
      issueDate: spainTime(doc.issuedAt).date,
      invoiceType: invoiceType(doc.kind, doc.replaces?.kind),
      totalTax: amount(doc.taxAmount),
      totalAmount: amount(doc.total),
      prevHash: prev?.hash ?? null,
      generatedAt: spainTime(new Date()).iso,
    };
    const hash = recordHash(base);
    const created = await tx.verifactuRecord.create({
      data: { ...base, seq: (prev?.seq ?? 0) + 1, documentId: doc.id, hash, xml: registroAltaXml(doc, { ...base, issuerName, hash }, prev) },
      select: { seq: true, issuerNif: true, numSerie: true, issueDate: true, hash: true },
    });
    prev = created;
  }
  return docs.length;
}

// Recomputes every hash and link: where the chain breaks, if anywhere
export function checkChain(records: { seq: number; issuerNif: string; numSerie: string; issueDate: string; invoiceType: string; totalTax: string; totalAmount: string; prevHash: string | null; generatedAt: string; hash: string }[]) {
  let prevHash: string | null = null;
  for (const r of records) {
    if (r.prevHash !== prevHash || recordHash(r) !== r.hash) return { ok: false as const, brokenAt: r.seq };
    prevHash = r.hash;
  }
  return { ok: true as const };
}
