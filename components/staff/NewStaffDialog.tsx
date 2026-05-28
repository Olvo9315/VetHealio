"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createStaffMember } from "@/lib/actions/staff";
import { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface NewStaffDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const ROLES: Role[] = ["VETERINARIAN", "RECEPTIONIST", "ASSISTANT", "ADMIN"];

export function NewStaffDialog({ open, onOpenChange }: NewStaffDialogProps) {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "VETERINARIAN" as Role,
    phone: "",
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const result = await createStaffMember(form);
      if (result?.error) {
        if ("fieldErrors" in result.error) setErrors(result.error.fieldErrors as Record<string, string[]>);
        toast.error(t("errorSave"));
        return;
      }
      toast.success(t("saved"));
      onOpenChange(false);
      setForm({ name: "", email: "", password: "", role: "VETERINARIAN", phone: "" });
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>{t("name")}</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            {errors.name && <p className="text-xs text-destructive">{errors.name[0]}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t("email")}</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
            {errors.email && <p className="text-xs text-destructive">{errors.email[0]}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t("password")}</Label>
            <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={6} />
            {errors.password && <p className="text-xs text-destructive">{errors.password[0]}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t("role")}</Label>
            <Select value={form.role} onValueChange={(v) => set("role", v ?? "VETERINARIAN")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("phone")}</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tc("cancel")}</Button>
            <Button type="submit" disabled={isPending}>{isPending ? tc("loading") : tc("create")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
