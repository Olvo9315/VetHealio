"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2, ImagePlus, Loader2, Trash2 } from "lucide-react";
import type { ClinicInfo } from "@/lib/clinic";
import { updateClinicSettings, type ClinicFormData } from "@/lib/actions/clinic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FieldName = keyof ClinicFormData;

interface ClinicCardProps {
  clinic: ClinicInfo;
}

export function ClinicCard({ clinic }: ClinicCardProps) {
  const t = useTranslations("clinic");
  const router = useRouter();
  const [isSaving, startSave] = useTransition();
  const [logoBusy, setLogoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Plain uncontrolled form: our Input doesn't forward refs, which react-hook-form needs
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const initial: Record<FieldName, string> = {
    name: clinic.name,
    legalName: clinic.legalName ?? "",
    nif: clinic.nif ?? "",
    registrationNumber: clinic.registrationNumber ?? "",
    address: clinic.address ?? "",
    postalCode: clinic.postalCode ?? "",
    city: clinic.city ?? "",
    province: clinic.province ?? "",
    country: clinic.country,
    phone: clinic.phone ?? "",
    email: clinic.email ?? "",
    website: clinic.website ?? "",
    iban: clinic.iban ?? "",
    defaultTaxRate: String(clinic.defaultTaxRate),
    invoiceFooter: clinic.invoiceFooter ?? "",
    dataLocale: clinic.dataLocale,
  };

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as unknown as ClinicFormData;
    startSave(async () => {
      const result = await updateClinicSettings(data);
      if ("error" in result && result.error) {
        const fieldErrors = result.error.fieldErrors as Partial<Record<FieldName, string[]>>;
        setErrors(
          Object.fromEntries(
            Object.entries(fieldErrors).map(([field, messages]) => {
              const code = messages?.[0];
              return [field, code && t.has(code) ? t(code) : t("invalidValue")];
            })
          )
        );
        toast.error(t("errorSave"));
        return;
      }
      setErrors({});
      toast.success(t("saved"));
      router.refresh();
    });
  }

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/clinic/logo", { method: "POST", body: formData });
      if (!res.ok) throw new Error();
      toast.success(t("logoUpdated"));
      router.refresh();
    } catch {
      toast.error(t("logoError"));
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    try {
      const res = await fetch("/api/clinic/logo", { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast.error(t("logoError"));
    } finally {
      setLogoBusy(false);
    }
  }

  function field(name: FieldName, label: string, props: React.ComponentProps<typeof Input> = {}) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`clinic-${name}`}>{label}</Label>
        <Input id={`clinic-${name}`} name={name} defaultValue={initial[name]} {...props} />
        {errors[name] && <p className="text-xs text-destructive">{errors[name]}</p>}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-3">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{t("title")}</h2>
      </div>

      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clinic.logoUrl} alt={clinic.name} className="w-full h-full object-contain" />
          ) : (
            <Building2 className="w-6 h-6 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={logoBusy}
              onClick={() => fileRef.current?.click()}
            >
              {logoBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-2" />}
              {t("uploadLogo")}
            </Button>
            {clinic.logoUrl && (
              <Button type="button" variant="ghost" size="sm" disabled={logoBusy} onClick={removeLogo}>
                <Trash2 className="w-4 h-4 mr-2" />
                {t("removeLogo")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("logoHint")}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadLogo(file);
            }}
          />
        </div>
      </div>

      <form className="space-y-6" onSubmit={onSubmit}>
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionIdentity")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {field("name", `${t("name")} *`, { required: true })}
            {field("legalName", t("legalName"))}
            {field("nif", t("nif"), { placeholder: "B12345678" })}
            {field("registrationNumber", t("registrationNumber"))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionAddress")}</h3>
          {field("address", t("address"))}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {field("postalCode", t("postalCode"))}
            {field("city", t("city"))}
            {field("province", t("province"))}
            {field("country", `${t("country")} *`, { required: true })}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionContact")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {field("phone", t("phone"), { type: "tel", placeholder: "+34 600 000 000" })}
            {field("email", t("email"), { type: "email" })}
            {field("website", t("website"), { placeholder: "https://" })}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionLanguage")}</h3>
          <div className="space-y-1.5">
            <Label htmlFor="clinic-dataLocale">{t("dataLocale")}</Label>
            <select
              id="clinic-dataLocale"
              name="dataLocale"
              defaultValue={initial.dataLocale}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="es">Español</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
            <p className="text-xs text-muted-foreground">{t("dataLocaleHint")}</p>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionBilling")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">{field("iban", t("iban"), { placeholder: "ES00 0000 0000 0000 0000 0000" })}</div>
            {field("defaultTaxRate", t("defaultTaxRate"), { type: "number", step: "0.1", min: 0, max: 100 })}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clinic-invoiceFooter">{t("invoiceFooter")}</Label>
            <Textarea
              id="clinic-invoiceFooter"
              rows={3}
              name="invoiceFooter"
              defaultValue={initial.invoiceFooter}
            />
            <p className="text-xs text-muted-foreground">{t("invoiceFooterHint")}</p>
          </div>
        </section>

        <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={isSaving}>
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {t("save")}
        </Button>
      </form>
    </div>
  );
}
