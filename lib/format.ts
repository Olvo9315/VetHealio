// Formatting and file helpers shared by lists and reports (client and server safe)

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function formatEur(value: number) {
  return eur.format(value);
}

// Rounds money to cents (avoids 0.1 + 0.2 style leftovers in sums and comparisons)
export function cents(value: number) {
  return Math.round(value * 100) / 100;
}

// CSV for Excel in Spain: semicolon separated, UTF-8 with BOM
export function toCsv(rows: (string | number)[][]) {
  return "﻿" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
