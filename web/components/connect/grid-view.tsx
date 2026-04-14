'use client'

import {
  Connection,
  getCategoryColor,
  getDaysSinceContact,
  isDrifting,
} from '@/lib/connect-data'
import { AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface GridViewProps {
  connections: Connection[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function GridView({
  connections,
  selectedId,
  onSelect,
}: GridViewProps) {
  const t = useTranslations('connect')

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4 overflow-y-auto h-full content-start">
      {connections.map(conn => {
        const color = getCategoryColor(conn.category)
        const days = getDaysSinceContact(conn.lastContactDate)
        const drift = isDrifting(conn)
        const isSelected = selectedId === conn.id
        const scoreW = Math.round(conn.connectionScore * 100)

        return (
          <button
            key={conn.id}
            onClick={() => onSelect(conn.id)}
            className={`relative text-left rounded-xl border p-4 transition-all ${
              isSelected
                ? 'border-primary/50 bg-primary/5'
                : 'border-border bg-card hover:border-primary/25 hover:bg-secondary/30'
            }`}
            aria-label={`${conn.name} - ${conn.role}, ${conn.company}`}
          >
            {drift && (
              <div className="absolute top-3 right-3">
                <AlertTriangle className="w-3.5 h-3.5 text-star-red" />
              </div>
            )}

            <div className="flex items-center gap-3 mb-3">
              <div className="relative shrink-0">
                <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
                  <circle cx="20" cy="20" r="18" fill={`${color}20`} />
                  <text
                    x="20"
                    y="25"
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="700"
                    fill={color}
                  >
                    {conn.name.slice(0, 2)}
                  </text>
                  <circle
                    cx="20"
                    cy="20"
                    r="17"
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeDasharray={`${conn.connectionScore * 2 * Math.PI * 17} ${2 * Math.PI * 17}`}
                    strokeLinecap="round"
                    transform="rotate(-90 20 20)"
                    opacity="0.7"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{conn.name}</p>
                <p className="text-xs text-muted-foreground truncate">{conn.role}</p>
              </div>
            </div>

            <div
              className="inline-block text-xs px-2 py-0.5 rounded-full mb-3"
              style={{ backgroundColor: `${color}15`, color }}
            >
              {conn.company || t(`category.${conn.category}`)}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground font-mono">score</span>
                <span className="text-xs font-mono" style={{ color }}>
                  {scoreW}
                </span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${scoreW}%`, backgroundColor: color, opacity: 0.8 }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-muted-foreground">
                {t(`category.${conn.category}`)}
              </span>
              <span
                className={`text-xs font-mono ${drift ? 'text-star-red' : 'text-muted-foreground'}`}
              >
                {conn.lastContactDate ? t('daysAgo', { days }) : t('noRecord')}
              </span>
            </div>

            <div className="flex flex-wrap gap-1 mt-2">
              {conn.tags.slice(0, 2).map(tag => (
                <span
                  key={tag}
                  className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono"
                >
                  {tag}
                </span>
              ))}
              {conn.tags.length > 2 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono">
                  +{conn.tags.length - 2}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
