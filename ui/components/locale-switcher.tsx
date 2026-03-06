"use client"

import { useTransition } from "react"
import { useLocale, useTranslations } from "next-intl"
import { setLocale } from "@/app/actions/locale"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Globe } from "lucide-react"

const LOCALES = ["ko", "en", "zh", "ja"] as const

export function LocaleSwitcher() {
  const t = useTranslations("settings")
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  function handleChange(value: string) {
    startTransition(async () => {
      await setLocale(value)
      window.location.reload()
    })
  }

  return (
    <div className="flex items-center gap-3">
      <Globe className="size-4 text-muted-foreground shrink-0" />
      <Select value={locale} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOCALES.map((loc) => (
            <SelectItem key={loc} value={loc}>
              {t(`languageNames.${loc}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
