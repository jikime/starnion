'use client'

import { useState } from 'react'
import NavBar from '@/components/connect/nav-bar'
import ListView from '@/components/connect/list-view'
import GridView from '@/components/connect/grid-view'
import PersonaCard from '@/components/connect/persona-card'
import RemindersPanel from '@/components/connect/reminders-panel'
import OcrScanner from '@/components/connect/ocr-scanner'
import { SAMPLE_CONNECTIONS, Category, isDrifting } from '@/lib/connect-data'
import { Search, SlidersHorizontal, Bell } from 'lucide-react'

type ViewMode = 'list' | 'grid'
type SortMode = 'score' | 'name' | 'recent'
type RightPanel = 'reminders' | 'persona'

const SORT_LABELS: Record<SortMode, string> = {
  score: '연결도순',
  name: '이름순',
  recent: '최근 연락순',
}

const CATEGORY_FILTER_LABELS: Record<Category | 'all', string> = {
  all: '전체',
  business: '비즈니스',
  friend: '친구',
  family: '가족',
  community: '커뮤니티',
}

export default function ConnectPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedId, setSelectedId] = useState<string | null>('1')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('score')
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all')
  const [rightPanel, setRightPanel] = useState<RightPanel>('persona')
  const [showScanner, setShowScanner] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const nudgeCount = SAMPLE_CONNECTIONS.filter(isDrifting).length
  const selectedConnection = SAMPLE_CONNECTIONS.find(c => c.id === selectedId) ?? null

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setRightPanel('persona')
  }

  const handleScannerAdd = (card: Record<string, string>) => {
    setShowScanner(false)
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-background text-foreground overflow-hidden">
      <NavBar
        viewMode={viewMode}
        onViewChange={setViewMode}
        onScanClick={() => setShowScanner(true)}
      />

      {/* Toolbar: search + filter + stats */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border bg-card/30 shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="이름, 회사, 태그 검색..."
            className="w-full h-8 pl-8 pr-3 text-xs bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            aria-label="인맥 검색"
          />
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 h-8 px-3 text-xs rounded-lg border transition-colors ${
            showFilters || filterCategory !== 'all' || sortMode !== 'score'
              ? 'border-primary/40 text-primary bg-primary/8'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          필터
          {filterCategory !== 'all' && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </button>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-4 ml-auto">
          <StatBadge label="전체" value={SAMPLE_CONNECTIONS.length} />
          <StatBadge
            label="연락 필요"
            value={nudgeCount}
            color={nudgeCount > 0 ? 'var(--star-red)' : undefined}
          />
        </div>

        {/* Right panel toggle */}
        <div className="hidden lg:flex items-center gap-1 bg-secondary rounded-lg p-0.5">
          <button
            onClick={() => setRightPanel('persona')}
            className={`text-xs px-3 py-1.5 rounded transition-colors ${
              rightPanel === 'persona'
                ? 'bg-card text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            인물 카드
          </button>
          <button
            onClick={() => setRightPanel('reminders')}
            className={`relative text-xs px-3 py-1.5 rounded transition-colors ${
              rightPanel === 'reminders'
                ? 'bg-card text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            리마인더
            {nudgeCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-star-gold rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Filter bar (collapsible) */}
      {showFilters && (
        <div className="flex items-center gap-6 px-5 py-2 border-b border-border bg-card/20 shrink-0">
          {/* Category filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">카테고리</span>
            <div className="flex items-center gap-1">
              {(Object.entries(CATEGORY_FILTER_LABELS) as [Category | 'all', string][]).map(([cat, label]) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    filterCategory === cat
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">정렬</span>
            <div className="flex items-center gap-1">
              {(Object.entries(SORT_LABELS) as [SortMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    sortMode === mode
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main layout: content + right panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center: list or grid */}
        <main className="flex-1 overflow-hidden min-w-0">
          {viewMode === 'list' ? (
            <ListView
              selectedId={selectedId}
              onSelect={handleSelect}
              searchQuery={searchQuery}
              filterCategory={filterCategory}
              sortMode={sortMode}
            />
          ) : (
            <GridView
              selectedId={selectedId}
              onSelect={handleSelect}
              searchQuery={searchQuery}
            />
          )}
        </main>

        {/* Right panel */}
        <aside
          className="hidden lg:flex flex-col w-72 xl:w-80 shrink-0 border-l border-border bg-card/50 overflow-hidden"
          aria-label={rightPanel === 'persona' ? '인물 상세 정보' : '스마트 리마인더'}
        >
          {rightPanel === 'persona' ? (
            selectedConnection ? (
              <PersonaCard
                connection={selectedConnection}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <EmptyPersona onScanClick={() => setShowScanner(true)} />
            )
          ) : (
            <RemindersPanel onSelectContact={handleSelect} />
          )}
        </aside>
      </div>

      {/* OCR Scanner modal */}
      {showScanner && (
        <OcrScanner
          onClose={() => setShowScanner(false)}
          onAdd={handleScannerAdd}
        />
      )}
    </div>
  )
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: string
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="text-sm font-mono font-bold"
        style={{ color: color ?? 'var(--foreground)' }}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function EmptyPersona({ onScanClick }: { onScanClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
      <div className="w-12 h-12 rounded-full border border-border bg-secondary flex items-center justify-center">
        <Bell className="w-5 h-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">인물을 선택하세요</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          목록이나 카드에서 인연을 클릭하면<br />상세 정보가 여기에 표시됩니다
        </p>
      </div>
      <button
        onClick={onScanClick}
        className="text-xs text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
      >
        명함을 스캔하여 새 인연 추가하기
      </button>
    </div>
  )
}
