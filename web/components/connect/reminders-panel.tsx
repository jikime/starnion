'use client'

import { Bell, Sparkles } from 'lucide-react'

export default function RemindersPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Smart Nudge</h3>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-full border border-border bg-secondary flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            Phase 2에서 제공됩니다
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            드리프트 알림과 생일/기념일 리마인더는<br />
            다음 단계에서 추가될 예정입니다.
          </p>
        </div>
      </div>
    </div>
  )
}
