import { getRequestConfig } from "next-intl/server"
import { cookies, headers } from "next/headers"

const SUPPORTED_LOCALES = ["ko", "en", "zh", "ja"] as const
type Locale = (typeof SUPPORTED_LOCALES)[number]

function isValidLocale(locale: string): locale is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale)
}

function parseAcceptLanguage(header: string): Locale {
  // Accept-Language 헤더에서 첫 번째 언어 코드(2자리)를 추출합니다.
  // 예: "ko-KR,ko;q=0.9,en-US;q=0.8" → "ko"
  const first = header.split(",")[0]?.split(";")[0]?.trim() ?? ""
  const code = first.slice(0, 2).toLowerCase()
  return isValidLocale(code) ? code : "en"
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieVal = cookieStore.get("NEXT_LOCALE")?.value

  let locale: Locale
  if (cookieVal && isValidLocale(cookieVal)) {
    // 1순위: 쿠키에 명시된 언어
    locale = cookieVal
  } else {
    // 2순위: 브라우저 Accept-Language 헤더
    const headerStore = await headers()
    const acceptLang = headerStore.get("accept-language") ?? ""
    locale = acceptLang ? parseAcceptLanguage(acceptLang) : "en"
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
