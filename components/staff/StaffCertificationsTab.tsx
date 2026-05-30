"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createCertification, deleteCertification } from "@/lib/actions/certifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Award, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { differenceInDays, format } from "date-fns";
import { cn } from "@/lib/utils";

type Cert = {
  id: string;
  name: string;
  issuedBy: string | null;
  issuedDate: Date | null;
  expiryDate: Date | null;
};

interface StaffCertificationsTabProps {
  staffProfileId: string;
  certifications: Cert[];
}

export function StaffCertificationsTab({ staffProfileId, certifications }: StaffCertificationsTabProps) {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", issuedBy: "", issuedDate: "", expiryDate: "" });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createCertification({ staffProfileId, ...form });
      if (result?.error) { toast.error(t("errorSave")); return; }
      toast.success(t("saved"));
      setDialogOpen(false);
      setForm({ name: "", issuedBy: "", issuedDate: "", expiryDate: "" });
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCertification(id);
      toast.success(t("deleted"));
      router.refresh();
    });
  }

  function expiryStatus(cert: Cert) {
    if (!cert.expiryDate) return null;
    const days = differenceInDays(new Date(cert.expiryDate), new Date());
    if (days < 0) return { label: t("expired"), className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
    if (days < 7) return { label: `${t("expiresIn")} ${days}d`, className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
    if (days < 30) return { label: `${t("expiresIn")} ${days}d`, className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" };
    return { label: format(new Date(cert.expiryDate), "dd/MM/yyyy"), className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" };
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />{t("addCert")}
        </Button>
      </div>

      {certifications.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Award className="mx-auto h-8 w-8 mb-2 opacity-30" />
          {t("noCerts")}
        </div>
      ) : (
        <div className="space-y-3">
          {certifications.map((cert) => {
            const status = expiryStatus(cert);
            return (
              <div key={cert.id} className="flex items-start justify-between rounded-lg border border-border bg-card p-4">
                <div className="flex gap-3">
                  {status?.className.includes("red") ? (
                    <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                  ) : (
                    <ShieldCheck className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{cert.name}</p>
                    {cert.issuedBy && <p className="text-xs text-muted-foreground">{cert.issuedBy}</p>}
                    {cert.issuedDate && (
                      <p className="text-xs text-muted-foreground">
                        {t("issuedDate")}: {format(new Date(cert.issuedDate), "dd/MM/yyyy")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {status && (
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", status.className)}>
                      {status.label}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={isPending}
                    onClick={() => handleDelete(cert.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("addCert")}</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-1">
              <Label>{t("certName")}</Label>
              <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("issuedBy")}</Label>
              <Input value={form.issuedBy} onChange={(e) => setForm((f) => ({ ...f, issuedBy: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("issuedDate")}</Label>
                <input type="date" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={form.issuedDate} onChange={(e) => setForm((f) => ({ ...f, issuedDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("expiryDate")}</Label>
                <input type="date" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{tc("cancel")}</Button>
              <Button type="submit" disabled={isPending}>{isPending ? tc("loading") : tc("add")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
