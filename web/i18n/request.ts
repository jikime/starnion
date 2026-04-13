import { getRequestConfig } from "next-intl/server"
import { cookies, headers } from "next/headers"

// Static imports so Turbopack (Next 15+/16) tracks each locale JSON
// as a proper module dependency and invalidates the request config
// on HMR when any `messages/*.json` file is edited. Previously this
// file used `await import(`../messages/${locale}.json`)`, whose
// module specifier is not known at compile time — Turbopack can't
// wire the JSON files into its HMR graph through that form, and
// edits to a message catalog would silently ship with the stale
// bundle until the dev server was restarted (manifesting as
// `MISSING_MESSAGE: Could not resolve ... in messages for locale …`
// errors for freshly added keys).
import koMessages from "../messages/ko.json"
import enMessages from "../messages/en.json"
import jaMessages from "../messages/ja.json"
import zhMessages from "../messages/zh.json"

const SUPPORTED_LOCALES = ["ko", "en", "zh", "ja"] as const
type Locale = (typeof SUPPORTED_LOCALES)[number]

// Map locale → statically-imported catalog. `unknown` cast around
// the JSON modules keeps TypeScript happy without fabricating a
// shared message-shape type (next-intl infers it at call sites).
const MESSAGES: Record<Locale, Record<string, unknown>> = {
  ko: koMessages as Record<string, unknown>,
  en: enMessages as Record<string, unknown>,
  ja: jaMessages as Record<string, unknown>,
  zh: zhMessages as Record<string, unknown>,
}

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
    messages: MESSAGES[locale],
  }
})
