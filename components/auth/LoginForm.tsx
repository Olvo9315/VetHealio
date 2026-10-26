"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ClinicMark, type ClinicBrand } from "@/components/layout/ClinicMark";

export function LoginForm({ clinic }: { clinic: ClinicBrand }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error(t("invalidCredentials"));
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    });
  }

  return (
    <div className="w-full max-w-sm">
      {/* Card */}
      <div className="bg-card rounded-2xl shadow-lg border border-border p-8 space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <ClinicMark logoUrl={clinic.logoUrl} name={clinic.name} className="w-16 h-16 rounded-xl" iconClassName="w-6 h-6" />
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-foreground">{clinic.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("welcome")}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium">
              {t("email")}
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@clinic.com"
              required
              autoComplete="email"
              className="h-11"
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium">
              {t("password")}
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="h-11"
              disabled={isPending}
            />
          </div>

          <Button
            type="submit"
            className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("loading")}
              </>
            ) : (
              t("loginButton")
            )}
          </Button>
        </form>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        VetHealio © {new Date().getFullYear()}
      </p>
    </div>
  );
}
