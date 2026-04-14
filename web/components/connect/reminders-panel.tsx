'use client'

import { Bell, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function RemindersPanel() {
  const t = useTranslations('connect.reminders')
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-full border border-border bg-secondary flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{t('phase2Notice')}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {t('phase2Body')}
          </p>
        </div>
      </div>
    </div>
  )
}
