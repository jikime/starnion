'use client'

import {
  Connection,
  getCategoryColor,
  getDaysSinceContact,
  isDrifting,
} from '@/lib/connect-data'
import {
  AlertTriangle,
  Clock,
  CreditCard,
  Mail,
  MapPin,
  Phone,
} from 'lucide-react'
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

        const contactLines = [
          conn.email && { icon: Mail, text: conn.email },
          conn.phone && { icon: Phone, text: conn.phone },
          conn.meetingLocation && { icon: MapPin, text: conn.meetingLocation },
        ].filter(Boolean) as { icon: typeof Mail; text: string }[]
        // Show up to two contact lines to keep cards uniform.
        const visibleContactLines = contactLines.slice(0, 2)

        return (
          <button
            key={conn.id}
            onClick={() => onSelect(conn.id)}
            className={`group relative text-left rounded-xl border p-4 transition-all flex flex-col ${
              isSelected
                ? 'border-primary/50 bg-primary/5'
                : 'border-border bg-card hover:border-primary/25 hover:bg-secondary/30'
            }`}
            aria-label={`${conn.name} - ${conn.role}, ${conn.company}`}
          >
            {/* Header: avatar + name + category pill */}
            <div className="flex items-start gap-3 mb-3">
              <div className="relative shrink-0">
                <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
                  <circle cx="22" cy="22" r="20" fill={`${color}20`} />
                  <text
                    x="22"
                    y="27"
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="700"
                    fill={color}
                  >
                    {conn.name.slice(0, 2)}
                  </text>
                  <circle
                    cx="22"
                    cy="22"
                    r="19"
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeDasharray={`${conn.connectionScore * 2 * Math.PI * 19} ${2 * Math.PI * 19}`}
                    strokeLinecap="round"
                    transform="rotate(-90 22 22)"
                    opacity="0.7"
                  />
                </svg>
                {drift && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-background flex items-center justify-center">
                    <AlertTriangle className="w-2.5 h-2.5 text-star-red" />
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate min-w-0">
                    {conn.name}
                  </p>
                  <span
                    className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    {t(`category.${conn.category}`)}
                  </span>
                </div>
                {(conn.role || conn.company) && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conn.role}
                    {conn.role && conn.company ? ' · ' : ''}
                    {conn.company}
                  </p>
                )}
                {conn.businessCard?.imageUrl && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 mt-1">
                    <CreditCard className="w-2.5 h-2.5" />
                    {t('personaCard.businessCard')}
                  </span>
                )}
              </div>
            </div>

            {/* Contact info — up to two lines, fills the card body */}
            {visibleContactLines.length > 0 && (
              <div className="space-y-1 mb-3">
                {visibleContactLines.map(({ icon: Icon, text }) => (
                  <div
                    key={text}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 min-w-0"
                  >
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="truncate">{text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Score bar — full width */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${scoreW}%`, backgroundColor: color, opacity: 0.8 }}
                />
              </div>
              <span className="text-[11px] font-mono w-7 text-right" style={{ color }}>
                {scoreW}
              </span>
            </div>

            {/* Footer: last contact / drift + tags */}
            <div className="mt-auto flex items-center justify-between gap-2">
              <span
                className={`flex items-center gap-1 text-[11px] font-mono ${
                  drift ? 'text-star-red' : 'text-muted-foreground'
                }`}
              >
                <Clock className="w-3 h-3" />
                {conn.lastContactDate ? t('daysAgo', { days }) : t('noRecord')}
              </span>
              {conn.tags.length > 0 && (
                <div className="flex items-center gap-1 min-w-0">
                  {conn.tags.slice(0, 2).map(tag => (
                    <span
                      key={tag}
                      className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono truncate max-w-[72px]"
                    >
                      {tag}
                    </span>
                  ))}
                  {conn.tags.length > 2 && (
                    <span className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-secondary text-muted-foreground font-mono">
                      +{conn.tags.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
