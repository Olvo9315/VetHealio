// Zod schemas live outside components, so they carry message *keys* from the
// "validation" namespace; components translate them when rendering errors.
type Translator = {
  (key: string): string;
  has: (key: string) => boolean;
};

export function translateMessage(t: Translator, message?: string | null) {
  if (!message) return "";
  return t.has(message) ? t(message) : message;
}
