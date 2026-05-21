import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { cookies } from "next/headers";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "VetHealio — CRM Veterinario",
  description: "Sistema de gestión para clínicas veterinarias",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "VetHealio" },
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/icon-maskable.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1D9E75",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const cookieStore = await cookies();
  const theme = cookieStore.get("theme")?.value ?? "light";

  return (
    <html lang={locale} className={theme === "dark" ? "dark" : ""} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster richColors position="top-right" />
          <InstallPrompt />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
