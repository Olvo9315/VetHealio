"use client";

import { useTransition, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { changePassword } from "@/lib/actions/settings";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Eye, EyeOff } from "lucide-react";

const schema = z
  .object({
    currentPassword: z.string().min(1, "required"),
    newPassword: z.string().min(6, "min6"),
    confirmPassword: z.string().min(1, "required"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "noMatch",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

interface PasswordCardProps {
  userId: string;
}

export function PasswordCard({ userId }: PasswordCardProps) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [isSaving, startSave] = useTransition();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  function getFieldError(msg: string | undefined) {
    if (!msg) return undefined;
    if (msg === "required") return tc("required");
    if (msg === "min6") return tc("min6chars");
    if (msg === "noMatch") return t("passwordsNoMatch");
    return msg;
  }

  function handleSubmit(data: FormData) {
    startSave(async () => {
      const result = await changePassword(userId, data);
      if ("error" in result) {
        const fe = (result.error as { fieldErrors?: Record<string, string[]> }).fieldErrors;
        if (fe?.currentPassword?.[0]) {
          form.setError("currentPassword", { message: t("incorrectPassword") });
        } else if (fe?.confirmPassword?.[0]) {
          form.setError("confirmPassword", { message: t("passwordsNoMatch") });
        } else {
          toast.error(t("errorPassword"));
        }
        return;
      }
      toast.success(t("passwordUpdated"));
      form.reset();
    });
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-3">
        <Lock className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{t("changePassword")}</h2>
      </div>

      <form
        ref={formRef}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (formRef.current) {
            formRef.current
              .querySelectorAll<HTMLInputElement>("input[name]")
              .forEach((input) => {
                if (input.value) {
                  form.setValue(input.name as keyof FormData, input.value, { shouldDirty: true });
                }
              });
          }
          form.handleSubmit(handleSubmit)();
        }}
      >
        {/* Current password */}
        <div className="space-y-1.5">
          <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
          <div className="relative">
            <Input
              id="currentPassword"
              type={showCurrent ? "text" : "password"}
              autoComplete="current-password"
              {...form.register("currentPassword")}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowCurrent((v) => !v)}
            >
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {form.formState.errors.currentPassword && (
            <p className="text-xs text-destructive">{getFieldError(form.formState.errors.currentPassword.message)}</p>
          )}
        </div>

        {/* New password */}
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">{t("newPassword")}</Label>
          <div className="relative">
            <Input
              id="newPassword"
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              {...form.register("newPassword")}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowNew((v) => !v)}
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {form.formState.errors.newPassword && (
            <p className="text-xs text-destructive">{getFieldError(form.formState.errors.newPassword.message)}</p>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword && (
            <p className="text-xs text-destructive">{getFieldError(form.formState.errors.confirmPassword.message)}</p>
          )}
        </div>

        <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={isSaving}>
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {t("updatePassword")}
        </Button>
      </form>
    </div>
  );
}
