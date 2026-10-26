import { LoginForm } from "@/components/auth/LoginForm";
import { getClinic } from "@/lib/clinic";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const { name, logoUrl } = await getClinic();
  return <LoginForm clinic={{ name, logoUrl }} />;
}
