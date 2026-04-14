'use client'

import { CreditCard, LayoutGrid, List, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ViewMode = 'list' | 'grid'

interface NavBarProps {
  viewMode: ViewMode
  onViewChange: (mode: ViewMode) => void
  onScanClick: () => void
  onAddClick: () => void
  driftCount?: number
}

export default function NavBar({
  viewMode,
  onViewChange,
  onScanClick,
  onAddClick,
  driftCount = 0,
}: NavBarProps) {
  return (
    <header className="flex items-center justify-between px-5 h-14 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Users className="size-6 text-blue-500" />
        인맥
      </h1>

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
          <span className="hidden sm:inline">명함 등록</span>
        </Button>

        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={onAddClick}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">새 인연 추가</span>
        </Button>
      </div>
    </header>
  )
}
