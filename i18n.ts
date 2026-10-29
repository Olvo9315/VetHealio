import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

const supported = ["es", "ru", "en"];

export default getRequestConfig(async ({ locale: requested }) => {
  // A document asks for its own language (getTranslations({ locale })); the UI uses the cookie
  const cookieStore = await cookies();
  const locale = requested ?? cookieStore.get("locale")?.value ?? "es";
  const resolvedLocale = supported.includes(locale) ? locale : "es";

  return {
    locale: resolvedLocale,
    messages: (await import(`./messages/${resolvedLocale}.json`)).default,
  };
});
