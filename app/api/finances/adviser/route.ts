import { NextRequest, NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { buildAdviserPackage } from "@/lib/adviser-package";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Download the adviser package for a period: ?from=yyyy-MM-dd&to=yyyy-MM-dd&format=pdf|csv&invoices=1
export async function GET(req: NextRequest) {
  if (!(await can("invoice.write"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  if (!DAY.test(from) || !DAY.test(to) || from > to) return NextResponse.json({ error: "Bad period" }, { status: 400 });
  const pack = await buildAdviserPackage(from, to, p.get("invoices") === "1");
  if (p.get("format") === "csv") {
    return new NextResponse(pack.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${pack.fileBase}.csv"`,
      },
    });
  }
  return new NextResponse(Buffer.from(pack.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // inline: opens in the browser, from where it can be saved or printed
      "Content-Disposition": `inline; filename="${pack.fileBase}.pdf"`,
    },
  });
}
