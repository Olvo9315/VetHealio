import { format, isBefore, addDays } from "date-fns";
import { Syringe, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useTranslations } from "next-intl";

interface Vaccination {
  id: string;
  vaccineName: string;
  dateAdministered: Date;
  nextDueDate: Date | null;
  batchNumber: string | null;
  veterinarian: { name: string };
}

function VaccinationStatus({ nextDueDate }: { nextDueDate: Date | null }) {
  const t = useTranslations("vaccinations");
  if (!nextDueDate) return null;

  const now = new Date();
  const soon = addDays(now, 30);

  if (isBefore(new Date(nextDueDate), now)) {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive font-medium">
        <AlertTriangle className="w-3.5 h-3.5" />
        {t("overdue")}
      </span>
    );
  }
  if (isBefore(new Date(nextDueDate), soon)) {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
        <Clock className="w-3.5 h-3.5" />
        {t("soon", { date: format(new Date(nextDueDate), "dd/MM/yyyy") })}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
      <CheckCircle className="w-3.5 h-3.5" />
      {format(new Date(nextDueDate), "dd/MM/yyyy")}
    </span>
  );
}

interface VaccinationsListProps {
  vaccinations: Vaccination[];
}

export function VaccinationsList({ vaccinations }: VaccinationsListProps) {
  const t = useTranslations("vaccinations");
  if (vaccinations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Syringe className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">{t("none")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {vaccinations.map((v) => (
        <div
          key={v.id}
          className="flex items-start justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Syringe className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">{v.vaccineName}</p>
              <p className="text-xs text-muted-foreground">
                {t("applied", { date: format(new Date(v.dateAdministered), "dd/MM/yyyy") })}
                {v.batchNumber ? ` · ${t("batch", { batch: v.batchNumber })}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">{t("doctor", { name: v.veterinarian.name })}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            {v.nextDueDate ? (
              <>
                <p className="text-xs text-muted-foreground mb-0.5">{t("nextDueDate")}</p>
                <VaccinationStatus nextDueDate={v.nextDueDate} />
              </>
            ) : (
              <span className="text-xs text-muted-foreground">{t("singleDose")}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
