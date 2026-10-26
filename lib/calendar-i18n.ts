import { useLocale, useTranslations } from "next-intl";
import { es, ru, enGB } from "date-fns/locale";

// date-fns locales keyed by UI language, for react-big-calendar's dateFnsLocalizer
export const calendarLocales = { es, ru, en: enGB };

// Culture + toolbar/agenda labels for react-big-calendar in the current UI language
export function useCalendarI18n() {
  const locale = useLocale();
  const t = useTranslations("calendar");
  return {
    culture: locale in calendarLocales ? locale : "es",
    messages: {
      today: t("today"),
      previous: t("previous"),
      next: t("next"),
      month: t("month"),
      week: t("week"),
      day: t("day"),
      agenda: t("agenda"),
      date: t("date"),
      time: t("time"),
      event: t("event"),
      allDay: t("allDay"),
      noEventsInRange: t("noEvents"),
      showMore: (total: number) => t("showMore", { count: total }),
    },
  };
}
