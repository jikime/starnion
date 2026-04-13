'use client'

import {
  Connection,
  getCategoryColor,
  getDaysSinceContact,
  isDrifting,
  CATEGORY_LABELS,
} from '@/lib/connect-data'
import { AlertTriangle, ChevronRight } from 'lucide-react'

interface ListViewProps {
  connections: Connection[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function ListView({
  connections,
  selectedId,
  onSelect,
}: ListViewProps) {
  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
        <p className="text-sm font-medium text-foreground">검색 결과 없음</p>
        <p className="text-xs text-muted-foreground">다른 키워드나 필터를 시도해보세요</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border overflow-y-auto h-full">
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
            className={`flex items-center gap-4 w-full text-left px-5 py-3.5 transition-colors group ${
              isSelected
                ? 'bg-primary/8 border-l-2 border-primary'
                : 'hover:bg-secondary/40 border-l-2 border-transparent'
            }`}
            aria-label={`${conn.name} - ${conn.role}, ${conn.company}`}
          >
            <div className="relative shrink-0">
              <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
                <circle cx="19" cy="19" r="16" fill={`${color}18`} />
                <text
                  x="19"
                  y="23"
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={color}
                >
                  {conn.name.slice(0, 2)}
                </text>
                <circle
                  cx="19"
                  cy="19"
                  r="16"
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeDasharray={`${conn.connectionScore * 2 * Math.PI * 16} ${2 * Math.PI * 16}`}
                  strokeLinecap="round"
                  transform="rotate(-90 19 19)"
                  opacity="0.65"
                />
              </svg>
              {drift && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-background flex items-center justify-center">
                  <AlertTriangle className="w-2.5 h-2.5 text-star-red" />
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground truncate">
                  {conn.name}
                </span>
                <span
                  className="shrink-0 text-xs px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: `${color}15`, color }}
                >
                  {CATEGORY_LABELS[conn.category]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {conn.role}
                {conn.role && conn.company ? ' · ' : ''}
                {conn.company}
              </p>
            </div>

            <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${scoreW}%`, backgroundColor: color, opacity: 0.75 }}
                  />
                </div>
                <span className="text-xs font-mono w-6 text-right" style={{ color }}>
                  {scoreW}
                </span>
              </div>
              <span
                className={`text-xs font-mono ${drift ? 'text-star-red' : 'text-muted-foreground'}`}
              >
                {conn.lastContactDate
                  ? `${days}일 전`
                  : '기록 없음'}
              </span>
            </div>

            <div className="hidden lg:flex items-center gap-1 shrink-0 w-32">
              {conn.tags.slice(0, 2).map(tag => (
                <span
                  key={tag}
                  className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono truncate max-w-[60px]"
                >
                  {tag}
                </span>
              ))}
            </div>

            <ChevronRight
              className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                isSelected ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}
