'use client'

import { Bell, AlertCircle, Cake, Heart, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  SAMPLE_CONNECTIONS,
  getDaysSinceContact,
  isDrifting,
  getCategoryColor,
  CATEGORY_LABELS,
} from '@/lib/connect-data'

interface ReminderItem {
  id: string
  type: 'drift' | 'birthday' | 'anniversary' | 'milestone'
  name: string
  company: string
  message: string
  urgency: 'high' | 'medium' | 'low'
  color: string
  category: string
}

function buildReminders(): ReminderItem[] {
  const reminders: ReminderItem[] = []

  SAMPLE_CONNECTIONS.forEach(c => {
    const days = getDaysSinceContact(c.lastContactDate)
    const color = getCategoryColor(c.category)

    if (isDrifting(c)) {
      const urgency = days > c.contactFrequencyTarget * 2 ? 'high' : 'medium'
      reminders.push({
        id: `drift-${c.id}`,
        type: 'drift',
        name: c.name,
        company: c.company,
        message: `마지막 연락 ${days}일 전 · 목표 주기 ${c.contactFrequencyTarget}일`,
        urgency,
        color,
        category: CATEGORY_LABELS[c.category],
      })
    }

    if (c.birthday) {
      const today = new Date()
      const bday = new Date(c.birthday)
      const thisYearBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate())
      const diff = Math.floor(
        (thisYearBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (diff >= 0 && diff <= 14) {
        reminders.push({
          id: `birthday-${c.id}`,
          type: 'birthday',
          name: c.name,
          company: c.company,
          message: diff === 0 ? '오늘이 생일입니다!' : `${diff}일 후 생일`,
          urgency: diff <= 3 ? 'high' : 'low',
          color: '#f5c842',
          category: CATEGORY_LABELS[c.category],
        })
      }
    }
  })

  // Add milestone reminder for demo
  reminders.push({
    id: 'milestone-demo',
    type: 'milestone',
    name: '정유진',
    company: 'Samsung Research',
    message: '연락한 지 100일째 됩니다',
    urgency: 'low',
    color: '#a78bfa',
    category: '비즈니스',
  })

  // Sort by urgency
  const order = { high: 0, medium: 1, low: 2 }
  return reminders.sort((a, b) => order[a.urgency] - order[b.urgency])
}

const URGENCY_CONFIG = {
  high: { label: '긴급', className: 'bg-star-red/10 border-star-red/30 text-star-red' },
  medium: { label: '주의', className: 'bg-star-gold/10 border-star-gold/30 text-star-gold' },
  low: { label: '알림', className: 'bg-primary/10 border-primary/30 text-primary' },
}

const TYPE_ICONS = {
  drift: AlertCircle,
  birthday: Cake,
  anniversary: Heart,
  milestone: Bell,
}

export default function RemindersPanel({ onSelectContact }: { onSelectContact: (id: string) => void }) {
  const reminders = buildReminders()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Smart Nudge</h3>
        </div>
        <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
          {reminders.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <MessageSquare className="w-6 h-6 mb-2 opacity-30" />
            <p className="text-sm">알림 없음</p>
          </div>
        ) : (
          reminders.map(r => {
            const Icon = TYPE_ICONS[r.type]
            const urgency = URGENCY_CONFIG[r.urgency]
            const conn = SAMPLE_CONNECTIONS.find(c => c.name === r.name)

            return (
              <div
                key={r.id}
                className="px-4 py-3 hover:bg-secondary/40 cursor-pointer transition-colors group"
                onClick={() => conn && onSelectContact(conn.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && conn && onSelectContact(conn.id)}
                aria-label={`${r.name} 알림: ${r.message}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: `${r.color}20` }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: r.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-foreground truncate">{r.name}</span>
                      <span
                        className={`shrink-0 text-xs px-1.5 py-0.5 rounded border ${urgency.className}`}
                      >
                        {urgency.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{r.company} · {r.category}</p>
                    <p className="text-xs text-muted-foreground mt-1">{r.message}</p>
                  </div>
                </div>
                <div className="mt-2.5 ml-10">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs text-primary/70 hover:text-primary px-2 py-0"
                    onClick={e => {
                      e.stopPropagation()
                    }}
                  >
                    <MessageSquare className="w-3 h-3 mr-1" />
                    메시지 초안
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
