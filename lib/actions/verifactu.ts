"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { PRODUCER, chainPendingDocuments, checkChain, qrSvg, qrUrl } from "@/lib/verifactu";

export type VerifactuRow = {
  id: string;
  seq: number;
  numSerie: string;
  invoiceType: string;
  issueDate: string;
  totalAmount: string;
  hash: string;
  status: string;
  documentId: string;
};

export type VerifactuStatus = {
  clinicNif: string | null;
  legalName: string | null;
  producerReady: boolean;
  qrOnPrint: boolean;
  env: string;
  total: number;
  pending: number;
  // Issued documents still without a record (the clinic's NIF is missing)
  unchained: number;
  chain: { ok: true } | { ok: false; brokenAt: number };
  rows: VerifactuRow[];
};

// What the VeriFactu tab shows: readiness, the state of the chain and the latest records.
// Documents issued before VeriFactu was added get their records here, once.
export async function getVerifactuStatus(): Promise<VerifactuStatus> {
  await requirePermission("invoice.write");
  await prisma.$transaction((tx) => chainPendingDocuments(tx));
  const [settings, all, rows, unchained] = await Promise.all([
    prisma.clinicSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} }),
    prisma.verifactuRecord.findMany({
      orderBy: { seq: "asc" },
      select: { seq: true, issuerNif: true, numSerie: true, issueDate: true, invoiceType: true, totalTax: true, totalAmount: true, prevHash: true, generatedAt: true, hash: true, status: true },
    }),
    prisma.verifactuRecord.findMany({
      orderBy: { seq: "desc" },
      take: 100,
      select: { id: true, seq: true, numSerie: true, invoiceType: true, issueDate: true, totalAmount: true, hash: true, status: true, documentId: true },
    }),
    prisma.fiscalDocument.count({ where: { verifactu: null } }),
  ]);
  return {
    clinicNif: settings.nif,
    legalName: settings.legalName,
    producerReady: !!PRODUCER.name && !!PRODUCER.nif,
    qrOnPrint: settings.verifactuQr,
    env: settings.verifactuEnv,
    total: all.length,
    pending: all.filter((r) => r.status === "PENDING").length,
    unchained,
    chain: checkChain(all),
    rows,
  };
}

// One record: its XML as it would be sent and its QR
export async function getVerifactuRecord(id: string) {
  await requirePermission("invoice.write");
  const [r, settings] = await Promise.all([
    prisma.verifactuRecord.findUnique({ where: { id } }),
    prisma.clinicSettings.findUnique({ where: { id: "default" }, select: { verifactuEnv: true } }),
  ]);
  if (!r) return null;
  const url = qrUrl(settings?.verifactuEnv ?? "test", r);
  return { ...r, qrUrl: url, qrSvg: await qrSvg(url) };
}

// Print the QR and "VERI*FACTU" on tickets and invoices
export async function setVerifactuQr(enabled: boolean) {
  await requirePermission("clinic.settings");
  await prisma.clinicSettings.upsert({ where: { id: "default" }, create: { id: "default", verifactuQr: enabled }, update: { verifactuQr: enabled } });
  revalidatePath("/finances");
}
