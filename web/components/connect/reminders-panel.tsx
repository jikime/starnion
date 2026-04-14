'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Bell, ChevronRight, Loader2, Sparkles, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ConnectApiError, listReminders } from '@/lib/connect-api'
import type { ReminderItem } from '@/lib/connect-data'

interface Props {
  /** Called when the user clicks a drift entry. Parent should select
   *  that connection and switch the right panel to persona view. */
  onSelect?: (connectionId: string) => void
  /** Called when the user closes the panel on mobile. Rendered as
   *  a close button in the header; hidden on desktop where the panel
   *  is always visible in the master-detail split. */
  onClose?: () => void
}

export default function RemindersPanel({ onSelect, onClose }: Props) {
  const t = useTranslations('connect.reminders')
  const [items, setItems] = useState<ReminderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    listReminders()
      .then(list => {
        if (!cancelled) setItems(list)
      })
      .catch(err => {
        if (cancelled) return
        if (err instanceof ConnectApiError) setLoadError(err.message)
        else setLoadError(t('loadFailed'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <span className="text-xs text-star-red font-mono">{items.length}</span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">…</span>
        </div>
      ) : loadError ? (
        <div className="flex-1 flex items-center justify-center px-4 text-center">
          <p className="text-xs text-star-red">{loadError}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="w-12 h-12 rounded-full border border-border bg-secondary flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">{t('empty')}</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-border">
          {items.map(r => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect?.(r.id)}
                className="w-full flex items-start gap-2 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-star-red mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t('item', { name: r.name, days: r.daysOverdue })}
                  </p>
                  {r.company && (
                    <p className="text-[11px] text-muted-foreground/70 truncate">
                      {r.company}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 mt-1" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
