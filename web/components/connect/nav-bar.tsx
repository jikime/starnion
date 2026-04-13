'use client'

import { CreditCard, LayoutGrid, List, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SAMPLE_CONNECTIONS, isDrifting } from '@/lib/connect-data'

type ViewMode = 'list' | 'grid'

interface NavBarProps {
  viewMode: ViewMode
  onViewChange: (mode: ViewMode) => void
  onScanClick: () => void
}

export default function NavBar({
  viewMode,
  onViewChange,
  onScanClick,
}: NavBarProps) {
  const driftCount = SAMPLE_CONNECTIONS.filter(isDrifting).length

  return (
    <header className="flex items-center justify-between px-5 h-14 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
          <Star className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-foreground tracking-tight">StarNion</span>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="text-sm text-primary font-medium">Connect</span>
          <span className="hidden sm:inline text-xs text-muted-foreground ml-1">인연의 별자리</span>
        </div>
      </div>

      {/* Center — view toggle */}
      <div className="hidden md:flex items-center gap-1 bg-secondary rounded-lg p-1">
        <button
          onClick={() => onViewChange('list')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            viewMode === 'list'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="목록 뷰"
          aria-pressed={viewMode === 'list'}
        >
          <List className="w-3.5 h-3.5" />
          목록 뷰
        </button>
        <button
          onClick={() => onViewChange('grid')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            viewMode === 'grid'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="카드 뷰"
          aria-pressed={viewMode === 'grid'}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          카드 뷰
        </button>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {driftCount > 0 && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-star-red bg-star-red/10 border border-star-red/20 px-2.5 py-1 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-star-red animate-pulse" />
            {driftCount}명 연락 필요
          </div>
        )}

        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5 border-border"
          onClick={onScanClick}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">명함 스캔</span>
        </Button>
      </div>
    </header>
  )
}
