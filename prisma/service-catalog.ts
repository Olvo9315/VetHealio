// Default service catalog for a new clinic. The official name is the label in the clinic's
// data language; the other labels become display translations. No prices — each clinic sets its own.
export type Locale = "es" | "ru" | "en";
export const LOCALES: Locale[] = ["es", "ru", "en"];

export type CatalogEntry = {
  labels: Record<Locale, string>;
  color?: string;
  children?: CatalogEntry[];
};

export const SERVICE_CATALOG: CatalogEntry[] = [
  {
    labels: { es: "Analítica de sangre", ru: "Анализ крови", en: "Blood test" },
    color: "#1D4ED8",
    children: [
      {
        labels: { es: "General", ru: "Общий", en: "General" },
      },
      {
        labels: { es: "Prequirúrgica", ru: "Предоперационный", en: "Pre-surgical" },
      },
    ],
  },
  {
    labels: { es: "Cortar uñas", ru: "Стрижка когтей", en: "Nail trim" },
    color: "#D97706",
  },
  {
    labels: { es: "Esterilización", ru: "Стерилизация", en: "Spay" },
    color: "#B91C1C",
    children: [
      {
        labels: { es: "OHT gata", ru: "ОГЭ кошки", en: "Cat spay (OHE)" },
      },
      {
        labels: { es: "OHT perra", ru: "ОГЭ собаки", en: "Dog spay (OHE)" },
        children: [
          {
            labels: { es: "0 - 10 kg", ru: "0–10 кг", en: "0–10 kg" },
          },
          {
            labels: { es: "11 - 20 kg", ru: "11–20 кг", en: "11–20 kg" },
          },
          {
            labels: { es: "21 - 30 kg", ru: "21–30 кг", en: "21–30 kg" },
          },
        ],
      },
    ],
  },
  {
    labels: { es: "Castración", ru: "Кастрация", en: "Neutering" },
    color: "#7C3AED",
    children: [
      {
        labels: { es: "Gato", ru: "Кот", en: "Cat" },
      },
      {
        labels: { es: "Perro", ru: "Пёс", en: "Dog" },
        children: [
          {
            labels: { es: "0 - 10 kg", ru: "0–10 кг", en: "0–10 kg" },
          },
          {
            labels: { es: "11 - 20 kg", ru: "11–20 кг", en: "11–20 kg" },
          },
          {
            labels: { es: "21 - 40 kg", ru: "21–40 кг", en: "21–40 kg" },
          },
        ],
      },
    ],
  },
  {
    labels: { es: "Consulta", ru: "Консультация", en: "Consultation" },
    color: "#15803D",
    children: [
      {
        labels: { es: "General", ru: "Общая", en: "General" },
      },
      {
        labels: { es: "Seguimiento", ru: "Повторный приём", en: "Follow-up" },
      },
      {
        labels: { es: "Especialista", ru: "Специалист", en: "Specialist" },
      },
    ],
  },
  {
    labels: { es: "Ecografía", ru: "УЗИ", en: "Ultrasound" },
    color: "#0F766E",
    children: [
      {
        labels: { es: "Clínica", ru: "В клинике", en: "In-clinic" },
      },
      {
        labels: { es: "Servicio externo", ru: "Внешний специалист", en: "External service" },
      },
    ],
  },
  {
    labels: { es: "Analítica de orina", ru: "Анализ мочи", en: "Urinalysis" },
    color: "#6B7280",
  },
  {
    labels: { es: "Tira + sedimento", ru: "Тест-полоска + осадок", en: "Dipstick + sediment" },
    color: "#0891B2",
  },
  {
    labels: { es: "Citología", ru: "Цитология", en: "Cytology" },
    color: "#BE185D",
    children: [
      {
        labels: { es: "Auricular", ru: "Ушная", en: "Ear" },
      },
      {
        labels: { es: "Piel / tumor", ru: "Кожа / опухоль", en: "Skin / tumor" },
      },
    ],
  },
];
