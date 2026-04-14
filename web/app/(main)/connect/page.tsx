'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import NavBar from '@/components/connect/nav-bar'
import ListView from '@/components/connect/list-view'
import GridView from '@/components/connect/grid-view'
import PersonaCard from '@/components/connect/persona-card'
import RemindersPanel from '@/components/connect/reminders-panel'
import OcrScanner, { type ParsedScanResult } from '@/components/connect/ocr-scanner'
import NewConnectionDialog from '@/components/connect/new-connection-dialog'
import {
  Category,
  Connection,
  SocialPlatform,
  isDrifting,
} from '@/lib/connect-data'
import {
  ConnectApiError,
  deleteConnection,
  getConnection,
  listConnections,
  submitBusinessCardScan,
  updateSocialProfiles,
  type ListConnectionsQuery,
} from '@/lib/connect-api'
import { Search, SlidersHorizontal, Bell, Loader2 } from 'lucide-react'

type ViewMode = 'list' | 'grid'
type SortMode = ListConnectionsQuery['sort']
type RightPanel = 'reminders' | 'persona'

const SORT_LABELS: Record<Exclude<SortMode, undefined>, string> = {
  score_desc: '연결도순',
  name_asc: '이름순',
  last_contact_desc: '최근 연락순',
  last_contact_asc: '오래된 연락순',
  created_desc: '최근 등록순',
}

const CATEGORY_FILTER_LABELS: Record<Category | 'all', string> = {
  all: '전체',
  business: '비즈니스',
  friend: '친구',
  family: '가족',
  acquaintance: '지인',
}

const DEFAULT_SORT: Exclude<SortMode, undefined> = 'score_desc'

export default function ConnectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const urlCategory = (searchParams.get('category') as Category | null) ?? null
  const urlSort = (searchParams.get('sort') as Exclude<SortMode, undefined> | null) ?? null
  const urlQ = searchParams.get('q') ?? ''

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(urlQ)
  const [sortMode, setSortMode] = useState<Exclude<SortMode, undefined>>(
    urlSort ?? DEFAULT_SORT
  )
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>(
    urlCategory ?? 'all'
  )
  const [rightPanel, setRightPanel] = useState<RightPanel>('persona')
  const [showScanner, setShowScanner] = useState(false)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const [connections, setConnections] = useState<Connection[]>([])
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openSnsEdit, setOpenSnsEdit] = useState(false)

  // Persist filter/sort/search to URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (filterCategory !== 'all') params.set('category', filterCategory)
    if (sortMode !== DEFAULT_SORT) params.set('sort', sortMode)
    if (searchQuery) params.set('q', searchQuery)
    const qs = params.toString()
    router.replace(qs ? `/connect?${qs}` : '/connect', { scroll: false })
  }, [filterCategory, sortMode, searchQuery, router])

  // Fetch list whenever filters change
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    const query: ListConnectionsQuery = { sort: sortMode }
    if (filterCategory !== 'all') query.category = filterCategory
    if (searchQuery.trim()) query.q = searchQuery.trim()

    listConnections(query)
      .then(result => {
        if (cancelled) return
        setConnections(result.items)
        if (result.items.length > 0 && !selectedId) {
          setSelectedId(result.items[0].id)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ConnectApiError) {
          setLoadError(err.message)
        } else {
          setLoadError('인맥 목록을 불러오지 못했습니다')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategory, sortMode, searchQuery])

  // Fetch full connection detail when selection changes
  useEffect(() => {
    if (!selectedId) {
      setSelectedConnection(null)
      return
    }
    let cancelled = false
    // Seed from list cache if available
    const cached = connections.find(c => c.id === selectedId) ?? null
    if (cached) setSelectedConnection(cached)

    getConnection(selectedId)
      .then(full => {
        if (!cancelled) setSelectedConnection(full)
      })
      .catch(() => {
        // swallow — cached value (if any) already shown
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const nudgeCount = useMemo(
    () => connections.filter(isDrifting).length,
    [connections]
  )

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setRightPanel('persona')
    setOpenSnsEdit(false)
  }

  const handleConnectionUpdated = useCallback((updated: Connection) => {
    setConnections(prev =>
      prev.map(c => (c.id === updated.id ? updated : c))
    )
    setSelectedConnection(prev =>
      prev && prev.id === updated.id ? updated : prev
    )
  }, [])

  const handleScannerAdd = async (parsed: ParsedScanResult) => {
    try {
      const created = await submitBusinessCardScan({
        name: parsed.name,
        role: parsed.role || undefined,
        company: parsed.company || undefined,
        email: parsed.email || undefined,
        phone: parsed.phone || undefined,
        meeting_location: parsed.meetingLocation || undefined,
        tags: parsed.tags,
        business_card: parsed.imageUrl
          ? { image_url: parsed.imageUrl }
          : undefined,
      })
      // Prepend into list, select, leave scanner to handle its own closing
      setConnections(prev => [created, ...prev])
      setSelectedId(created.id)
      setRightPanel('persona')
      return created
    } catch (err) {
      if (err instanceof ConnectApiError) {
        throw err
      }
      throw new Error('명함 저장에 실패했습니다')
    }
  }

  const handleScannerSnsPrompt = (connectionId: string, addNow: boolean) => {
    setShowScanner(false)
    if (addNow) {
      setSelectedId(connectionId)
      setRightPanel('persona')
      setOpenSnsEdit(true)
    }
  }

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteConnection(id)
      setConnections(prev => prev.filter(c => c.id !== id))
      setSelectedConnection(null)
      setSelectedId(prev => (prev === id ? null : prev))
    } catch (err) {
      if (err instanceof ConnectApiError) {
        setLoadError(err.message)
      } else {
        setLoadError('삭제에 실패했습니다')
      }
      throw err
    }
  }, [])

  const handleSocialSubmit = async (
    patch: Partial<Record<SocialPlatform, string | null>>
  ) => {
    if (!selectedId) return
    const updated = await updateSocialProfiles(selectedId, patch)
    handleConnectionUpdated(updated)
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-background text-foreground overflow-hidden">
      <NavBar
        viewMode={viewMode}
        onViewChange={setViewMode}
        onScanClick={() => setShowScanner(true)}
        onAddClick={() => setShowNewDialog(true)}
        driftCount={nudgeCount}
      />

      {/* Toolbar: search + filter + stats */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border bg-card/30 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="이름 검색..."
            className="w-full h-8 pl-8 pr-3 text-xs bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            aria-label="인맥 검색"
          />
        </div>

        <button
          onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 h-8 px-3 text-xs rounded-lg border transition-colors ${
            showFilters || filterCategory !== 'all' || sortMode !== DEFAULT_SORT
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

        <div className="hidden sm:flex items-center gap-4 ml-auto">
          <StatBadge label="전체" value={connections.length} />
          <StatBadge
            label="연락 필요"
            value={nudgeCount}
            color={nudgeCount > 0 ? 'var(--star-red)' : undefined}
          />
        </div>

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

      {/* Filter bar */}
      {showFilters && (
        <div className="flex items-center gap-6 px-5 py-2 border-b border-border bg-card/20 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">카테고리</span>
            <div className="flex items-center gap-1">
              {(Object.entries(CATEGORY_FILTER_LABELS) as [Category | 'all', string][]).map(
                ([cat, label]) => (
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
                )
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">정렬</span>
            <div className="flex items-center gap-1">
              {(
                Object.entries(SORT_LABELS) as [Exclude<SortMode, undefined>, string][]
              ).map(([mode, label]) => (
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

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">불러오는 중...</span>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
              <p className="text-sm font-medium text-foreground">
                {loadError}
              </p>
              <p className="text-xs text-muted-foreground">
                잠시 후 다시 시도해주세요
              </p>
            </div>
          ) : connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
              <p className="text-sm font-medium text-foreground">
                {searchQuery || filterCategory !== 'all'
                  ? '필터에 해당하는 인연이 없습니다'
                  : '아직 등록된 인연이 없습니다'}
              </p>
              <p className="text-xs text-muted-foreground">
                명함 스캔으로 새 인연을 추가해보세요
              </p>
            </div>
          ) : viewMode === 'list' ? (
            <ListView
              connections={connections}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          ) : (
            <GridView
              connections={connections}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          )}
        </main>

        <aside
          className="hidden lg:flex flex-col w-72 xl:w-80 shrink-0 border-l border-border bg-card/50 overflow-hidden"
          aria-label={rightPanel === 'persona' ? '인물 상세 정보' : '스마트 리마인더'}
        >
          {rightPanel === 'persona' ? (
            selectedConnection ? (
              <PersonaCard
                connection={selectedConnection}
                onClose={() => setSelectedId(null)}
                onSubmitSocial={handleSocialSubmit}
                onDelete={handleDelete}
                snsEditOpen={openSnsEdit}
                onSnsEditOpenChange={setOpenSnsEdit}
              />
            ) : (
              <EmptyPersona onScanClick={() => setShowScanner(true)} />
            )
          ) : (
            <RemindersPanel />
          )}
        </aside>
      </div>

      {showScanner && (
        <OcrScanner
          onClose={() => setShowScanner(false)}
          onSubmit={handleScannerAdd}
          onSnsPrompt={handleScannerSnsPrompt}
        />
      )}

      <NewConnectionDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreated={created => {
          setConnections(prev => [created, ...prev])
          setSelectedId(created.id)
          setRightPanel('persona')
        }}
      />
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
