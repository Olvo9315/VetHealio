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

export function NewStaffDialog({ open, onOpenChange }: NewStaffDialogProps) {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
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
      setForm({ firstName: "", lastName: "", email: "", password: "", role: "VETERINARIAN", phone: "" });
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("firstName")}</Label>
              <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName[0]}</p>}
            </div>
            <div className="space-y-1">
              <Label>{t("lastName")}</Label>
              <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName[0]}</p>}
            </div>
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
              <SelectTrigger>
                <SelectValue>
                  {({ ADMIN: t("roleAdmin"), VETERINARIAN: t("roleVeterinarian"), RECEPTIONIST: t("roleReceptionist"), ASSISTANT: t("roleAssistant") })[form.role]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VETERINARIAN">{t("roleVeterinarian")}</SelectItem>
                <SelectItem value="RECEPTIONIST">{t("roleReceptionist")}</SelectItem>
                <SelectItem value="ASSISTANT">{t("roleAssistant")}</SelectItem>
                <SelectItem value="ADMIN">{t("roleAdmin")}</SelectItem>
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
