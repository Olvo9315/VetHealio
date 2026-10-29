import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Printable documents: no app chrome, always light, A4
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  if (!(await auth())) redirect("/login");
  return <div className="print-doc">{children}</div>;
}
