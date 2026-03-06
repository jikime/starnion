import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"

const SUPPORTED_LOCALES = ["ko", "en", "zh", "ja"] as const
type Locale = (typeof SUPPORTED_LOCALES)[number]

function isValidLocale(locale: string): locale is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale)
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const raw = cookieStore.get("NEXT_LOCALE")?.value ?? "ko"
  const locale: Locale = isValidLocale(raw) ? raw : "ko"

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
