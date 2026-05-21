import type { NextAuthConfig } from "next-auth";

// Edge-compatible config: no pg, no bcrypt, no prisma imports.
// Used by middleware to validate JWT without touching Node.js APIs.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.language = (user as { language?: string }).language;
        token.theme = (user as { theme?: string }).theme;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = token.role;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).language = token.language;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).theme = token.theme;
      }
      return session;
    },
  },
  providers: [],
};
