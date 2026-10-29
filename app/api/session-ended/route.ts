import { signOut } from "@/auth";

// The session's user no longer exists (see getActor): clear the session and go to the sign-in page
export async function GET() {
  await signOut({ redirectTo: "/login" });
}
