import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DocLine, TaxRow } from "@/lib/billing";

// PDF for the tax adviser: a cover with the period's totals by VAT rate, the list of issued documents
// (libro registro) and, optionally, every invoice on its own page. Built on the server so it can be
// e-mailed. Uses the standard Helvetica font (Latin text, accents, ñ and €); other scripts are
// transliterated or replaced so the file is always produced.

export type BookPdfDoc = {
  docNumber: string;
  kind: "SIMPLIFIED" | "FULL" | "RECTIFYING";
  issuedAt: Date;
  customerName: string;
  customerNif: string | null;
  customerAddress: string | null;
  lines: DocLine[];
  taxBreakdown: TaxRow[];
  taxBase: number;
  taxAmount: number;
  total: number;
  replacedBy: string | null;
  replaces: string | null;
  reason: string | null;
};

export type BookPdfInput = {
  clinic: { name: string; legalName: string | null; nif: string | null; address: string; contact: string };
  periodLabel: string;
  generatedAt: Date;
  docs: BookPdfDoc[];
  includeInvoices: boolean;
  // Labels in the clinic's data language
  l: Record<string, string>;
};

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", і: "i", ї: "yi", є: "ye", ґ: "g",
};

// Characters Helvetica (WinAnsi) can draw
function safe(text: string) {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const lower = ch.toLowerCase();
    if (CYR[lower] !== undefined) {
      const t = CYR[lower];
      out += ch === lower ? t : t.charAt(0).toUpperCase() + t.slice(1);
    } else if (/[\x20-\x7E -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(ch)) {
      out += ch;
    } else if (ch === "\n" || ch === "\t") {
      out += " ";
    } else if (ch === "›") {
      out += ">";
    } else {
      out += "?";
    }
  }
  return out;
}

const eur = (v: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v).replace(/ /g, " ");
const date = (d: Date) =>
  new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" }).format(d);

const A4: [number, number] = [595.28, 841.89];
const M = 40;
const GREY = rgb(0.4, 0.4, 0.4);
const LINE = rgb(0.8, 0.8, 0.8);

export async function buildBookPdf(input: BookPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(`${input.l.bookTitle} ${input.periodLabel}`));
  pdf.setAuthor(safe(input.clinic.legalName || input.clinic.name));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { l } = input;

  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - M;

  const text = (s: string, x: number, size = 9, f: PDFFont = font, color = rgb(0, 0, 0)) =>
    page.drawText(safe(s), { x, y, size, font: f, color });
  const right = (s: string, xRight: number, size = 9, f: PDFFont = font, color = rgb(0, 0, 0)) => {
    const str = safe(s);
    page.drawText(str, { x: xRight - f.widthOfTextAtSize(str, size), y, size, font: f, color });
  };
  const clip = (s: string, width: number, size = 9, f: PDFFont = font) => {
    let str = safe(s);
    while (str.length > 1 && f.widthOfTextAtSize(str, size) > width) str = str.slice(0, -2) + "…";
    return str;
  };
  const rule = (color = LINE, thickness = 0.6) =>
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: A4[0] - M, y: y + 3 }, thickness, color });
  const newPage = () => {
    page = pdf.addPage(A4);
    y = A4[1] - M;
  };
  const ensure = (h: number) => {
    if (y - h < M + 20) newPage();
  };

  function header(title: string, subtitle: string) {
    text(input.clinic.legalName || input.clinic.name, M, 12, bold);
    right(title, A4[0] - M, 14, bold);
    y -= 14;
    if (input.clinic.nif) text(`NIF ${input.clinic.nif}`, M, 8, font, GREY);
    right(subtitle, A4[0] - M, 9, font, GREY);
    y -= 11;
    if (input.clinic.address) { text(input.clinic.address, M, 8, font, GREY); y -= 11; }
    if (input.clinic.contact) { text(input.clinic.contact, M, 8, font, GREY); y -= 11; }
    y -= 4;
    rule(rgb(0.15, 0.15, 0.15), 1.2);
    y -= 16;
  }

  // ---- Cover: totals ----
  const counted = input.docs.filter((d) => !d.replacedBy);
  header(l.bookTitle, input.periodLabel);
  text(`${l.generated}: ${date(input.generatedAt)}`, M, 8, font, GREY);
  y -= 22;

  const byRate = new Map<number, { base: number; tax: number }>();
  for (const d of counted) for (const r of d.taxBreakdown) {
    const cur = byRate.get(r.rate) ?? { base: 0, tax: 0 };
    byRate.set(r.rate, { base: cur.base + r.base, tax: cur.tax + r.tax });
  }
  const count = (k: BookPdfDoc["kind"]) => input.docs.filter((d) => d.kind === k).length;
  text(l.summary, M, 11, bold);
  y -= 16;
  for (const [label, value] of [
    [l.docsSimplified, String(count("SIMPLIFIED"))],
    [l.docsFull, String(count("FULL"))],
    [l.docsRectifying, String(count("RECTIFYING"))],
    [l.docsReplaced, String(input.docs.length - counted.length)],
  ]) {
    text(label, M, 9);
    right(value, M + 260, 9);
    y -= 13;
  }
  y -= 8;
  text(l.vat, M, 9, bold);
  right(l.taxBase, M + 180, 9, bold);
  right(l.taxAmount, M + 260, 9, bold);
  right(l.total, M + 350, 9, bold);
  y -= 4;
  rule();
  y -= 10;
  for (const [rate, v] of Array.from(byRate.entries()).sort((a, b) => b[0] - a[0])) {
    text(`${rate}%`, M, 9);
    right(eur(v.base), M + 180, 9);
    right(eur(v.tax), M + 260, 9);
    right(eur(v.base + v.tax), M + 350, 9);
    y -= 13;
  }
  rule(rgb(0.15, 0.15, 0.15), 1);
  y -= 10;
  const sum = (f: (d: BookPdfDoc) => number) => counted.reduce((s, d) => s + f(d), 0);
  text(l.total, M, 10, bold);
  right(eur(sum((d) => d.taxBase)), M + 180, 10, bold);
  right(eur(sum((d) => d.taxAmount)), M + 260, 10, bold);
  right(eur(sum((d) => d.total)), M + 350, 10, bold);
  y -= 24;
  for (const note of [l.noteReplaced, l.noteRectifying]) {
    text(note, M, 7.5, font, GREY);
    y -= 10;
  }
  y -= 14;

  // ---- Register ----
  const cols = { num: M, date: M + 92, customer: M + 145, nif: M + 300, base: M + 410, tax: M + 465, total: A4[0] - M };
  const tableHead = () => {
    text(l.number, cols.num, 8, bold);
    text(l.date, cols.date, 8, bold);
    text(l.customer, cols.customer, 8, bold);
    text("NIF", cols.nif, 8, bold);
    right(l.taxBase, cols.base, 8, bold);
    right(l.vatShort, cols.tax, 8, bold);
    right(l.total, cols.total, 8, bold);
    y -= 4;
    rule(rgb(0.15, 0.15, 0.15), 0.8);
    y -= 10;
  };
  ensure(60);
  text(l.register, M, 11, bold);
  y -= 16;
  tableHead();
  for (const d of input.docs) {
    const note = d.replacedBy ? `${l.replacedBy} ${d.replacedBy}` : d.replaces ? `${d.kind === "RECTIFYING" ? l.rectifies : l.replaces} ${d.replaces}` : "";
    ensure(note ? 26 : 14);
    if (y > A4[1] - M - 5) tableHead();
    const color = d.replacedBy ? GREY : rgb(0, 0, 0);
    text(d.docNumber, cols.num, 8, font, color);
    text(date(d.issuedAt), cols.date, 8, font, color);
    text(clip(d.customerName, cols.nif - cols.customer - 6, 8), cols.customer, 8, font, color);
    text(clip(d.customerNif ?? "", 70, 8), cols.nif, 8, font, color);
    right(eur(d.taxBase), cols.base, 8, font, color);
    right(eur(d.taxAmount), cols.tax, 8, font, color);
    right(eur(d.total), cols.total, 8, font, color);
    y -= 10;
    if (note) { text(note, cols.num + 6, 7, font, GREY); y -= 9; }
    y -= 2;
  }

  // ---- Each invoice on its own page ----
  if (input.includeInvoices) {
    for (const d of input.docs) {
      newPage();
      header(d.kind === "FULL" ? l.fullInvoice : d.kind === "RECTIFYING" ? l.rectifyingInvoice : l.simplifiedInvoice, `N. ${d.docNumber}`);
      text(l.customer, M, 8, font, GREY);
      right(`${l.issueDate}: ${date(d.issuedAt)}`, A4[0] - M, 9);
      y -= 12;
      text(d.customerName, M, 10, bold);
      if (d.replaces) right(`${d.kind === "RECTIFYING" ? l.rectifies : l.replaces}: ${d.replaces}`, A4[0] - M, 9);
      y -= 12;
      if (d.customerNif) { text(`NIF ${d.customerNif}`, M, 9); y -= 12; }
      if (d.customerAddress) { text(clip(d.customerAddress, 300), M, 9); y -= 12; }
      if (d.reason) { text(`${l.reason}: ${clip(d.reason, 440)}`, M, 9); y -= 12; }
      if (d.replacedBy) { text(`${l.replacedBy} ${d.replacedBy}`, M, 9, bold, GREY); y -= 12; }
      y -= 10;
      text(l.description, M, 8, bold);
      right(l.qty, M + 330, 8, bold);
      right(l.price, M + 400, 8, bold);
      right(l.vat, M + 445, 8, bold);
      right(l.amount, A4[0] - M, 8, bold);
      y -= 4;
      rule(rgb(0.15, 0.15, 0.15), 0.8);
      y -= 10;
      for (const line of d.lines) {
        ensure(14);
        text(clip(line.description, 300, 9), M, 9);
        right(String(line.quantity), M + 330, 9);
        right(eur(line.unitPrice), M + 400, 9);
        right(`${line.taxRate}%`, M + 445, 9);
        right(eur(line.total), A4[0] - M, 9);
        y -= 13;
      }
      y -= 10;
      for (const r of d.taxBreakdown) {
        text(`${l.vat} ${r.rate}%`, M + 280, 9, font, GREY);
        right(`${l.taxBase} ${eur(r.base)}`, M + 420, 9, font, GREY);
        right(`${l.taxAmount} ${eur(r.tax)}`, A4[0] - M, 9, font, GREY);
        y -= 12;
      }
      y -= 4;
      page.drawLine({ start: { x: M + 280, y: y + 3 }, end: { x: A4[0] - M, y: y + 3 }, thickness: 1, color: rgb(0.15, 0.15, 0.15) });
      y -= 12;
      text(l.total, M + 280, 12, bold);
      right(eur(d.total), A4[0] - M, 12, bold);
    }
  }

  // Page numbers
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const s = safe(`${input.clinic.name} · ${input.periodLabel} · ${i + 1}/${pages.length}`);
    p.drawText(s, { x: A4[0] / 2 - font.widthOfTextAtSize(s, 7) / 2, y: 22, size: 7, font, color: GREY });
  });
  return pdf.save();
}
