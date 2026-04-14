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
import EditConnectionDialog from '@/components/connect/edit-connection-dialog'
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
  touchConnection,
  updateContextNotes,
  updateSocialProfiles,
  type ListConnectionsQuery,
} from '@/lib/connect-api'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Search, SlidersHorizontal, Bell, Loader2 } from 'lucide-react'

type ViewMode = 'list' | 'grid'
type SortMode = ListConnectionsQuery['sort']
type NonEmptySort = Exclude<SortMode, undefined>
type RightPanel = 'reminders' | 'persona'

const SORT_OPTIONS: NonEmptySort[] = [
  'score_desc',
  'name_asc',
  'last_contact_desc',
  'last_contact_asc',
  'created_desc',
]

const CATEGORY_FILTER_OPTIONS: (Category | 'all')[] = [
  'all',
  'business',
  'friend',
  'family',
  'acquaintance',
]

const DEFAULT_SORT: NonEmptySort = 'score_desc'

export default function ConnectPage() {
  const t = useTranslations('connect')
  const router = useRouter()
  const searchParams = useSearchParams()

  const urlCategory = (searchParams.get('category') as Category | null) ?? null
  const urlSort = (searchParams.get('sort') as NonEmptySort | null) ?? null
  const urlQ = searchParams.get('q') ?? ''

  const [viewMode, setViewMode] = useState<ViewMode>('list')

  // Mobile/tablet default → grid. Runs once on client mount so the
  // SSR output stays deterministic ('list') and avoids a hydration
  // mismatch. The viewport check matches Tailwind's `lg` breakpoint
  // (1024px) — desktop keeps the list-based master-detail layout,
  // anything narrower gets the card grid which reads better on a
  // phone. If the user later toggles manually, that choice wins.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setViewMode('grid')
    }
    // Intentionally no cleanup / resize listener — we honor the
    // user's explicit toggle after the initial default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(urlQ)
  const [sortMode, setSortMode] = useState<NonEmptySort>(
    urlSort ?? DEFAULT_SORT
  )
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>(
    urlCategory ?? 'all'
  )
  const [rightPanel, setRightPanel] = useState<RightPanel>('persona')
  const [showScanner, setShowScanner] = useState(false)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  // Tracks whether the mobile full-screen overlay is open. The
  // desktop aside is always visible at lg+ regardless; this flag
  // only controls the below-lg rendering so opening the
  // PersonaCard or RemindersPanel from mobile is an explicit action.
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)

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
          setLoadError(t('empty.loadFailed'))
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
    setMobilePanelOpen(true)
  }

  const handleMobileOpenReminders = () => {
    setRightPanel('reminders')
    setMobilePanelOpen(true)
  }

  const handleMobileClose = () => {
    setMobilePanelOpen(false)
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
      throw new Error(t('toasts.scanSaveFailed'))
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

  const handleTouch = useCallback(async (id: string) => {
    try {
      const previousContact = connections.find(c => c.id === id)?.lastContactDate
      const updated = await touchConnection(id)
      handleConnectionUpdated(updated)
      const daysSince = previousContact
        ? Math.floor(
            (Date.now() - new Date(previousContact).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null
      toast.success(
        daysSince !== null
          ? t('toasts.touched', { name: updated.name, days: daysSince })
          : t('toasts.touchedFirst', { name: updated.name })
      )
    } catch (err) {
      if (err instanceof ConnectApiError) {
        toast.error(err.message)
      } else {
        toast.error(t('toasts.touchFailed'))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, handleConnectionUpdated])

  const handleContextNotesSave = useCallback(
    async (id: string, notes: string) => {
      const updated = await updateContextNotes(id, notes)
      handleConnectionUpdated(updated)
      toast.success(t('toasts.memoSaved'))
    },
    [handleConnectionUpdated]
  )

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
        setLoadError(t('toasts.deleteFailed'))
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
            placeholder={t('searchPlaceholder')}
            className="w-full h-8 pl-8 pr-3 text-xs bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            aria-label={t('empty.searchAria')}
          />
        </div>

        <button
          onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 h-8 px-3 text-xs rounded-lg border transition-colors shrink-0 ${
            showFilters || filterCategory !== 'all' || sortMode !== DEFAULT_SORT
              ? 'border-primary/40 text-primary bg-primary/8'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('filter')}</span>
          {filterCategory !== 'all' && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </button>

        {/* Mobile-only Reminders trigger — the aside tab toggle is
            hidden below lg, so on small screens the user needs a
            dedicated entry point into the drift list. */}
        <button
          onClick={handleMobileOpenReminders}
          className={`lg:hidden relative flex items-center gap-1.5 h-8 px-3 text-xs rounded-lg border transition-colors shrink-0 ${
            nudgeCount > 0
              ? 'border-star-red/40 text-star-red bg-star-red/5'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
          aria-label={t('toolbar.reminders')}
        >
          <Bell className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('toolbar.reminders')}</span>
          {nudgeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-star-gold rounded-full" />
          )}
        </button>

        <div className="hidden sm:flex items-center gap-4 ml-auto">
          <StatBadge label={t('toolbar.total')} value={connections.length} />
          <StatBadge
            label={t('toolbar.needContact')}
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
            {t('toolbar.personCard')}
          </button>
          <button
            onClick={() => setRightPanel('reminders')}
            className={`relative text-xs px-3 py-1.5 rounded transition-colors ${
              rightPanel === 'reminders'
                ? 'bg-card text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('toolbar.reminders')}
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
            <span className="text-xs text-muted-foreground shrink-0">{t('categoryLabel')}</span>
            <div className="flex items-center gap-1">
              {CATEGORY_FILTER_OPTIONS.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    filterCategory === cat
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {t(`category.${cat}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">{t('sort.label')}</span>
            <div className="flex items-center gap-1">
              {SORT_OPTIONS.map(mode => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    sortMode === mode
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {t(`sort.${mode}`)}
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
              <span className="text-sm">{t('empty.loading')}</span>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
              <p className="text-sm font-medium text-foreground">
                {loadError}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('empty.loadRetry')}
              </p>
            </div>
          ) : connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
              <p className="text-sm font-medium text-foreground">
                {searchQuery || filterCategory !== 'all'
                  ? t('empty.noFiltered')
                  : t('empty.noConnections')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('empty.scanCta')}
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

        {/*
          Responsive aside. ONE element that switches presentation:
            - lg+ : side panel, always visible (master-detail)
            - <lg : full-screen overlay, only visible when
                    `mobilePanelOpen` is true
          Keeping it a single element means PersonaCard mounts once
          regardless of viewport, so the shared activity fetch is
          not duplicated on viewport change.
        */}
        <aside
          className={`
            flex-col bg-card/50 overflow-hidden
            lg:flex lg:relative lg:shrink-0 lg:w-80 xl:w-96 2xl:w-[28rem] lg:border-l lg:border-border
            ${mobilePanelOpen ? 'fixed inset-0 z-40 flex' : 'hidden'}
          `}
          aria-label={rightPanel === 'persona' ? t('empty.personaAria') : t('empty.remindersAria')}
        >
          {rightPanel === 'persona' ? (
            selectedConnection ? (
              <PersonaCard
                connection={selectedConnection}
                onClose={() => {
                  setSelectedId(null)
                  handleMobileClose()
                }}
                onSubmitSocial={handleSocialSubmit}
                onDelete={handleDelete}
                onEdit={() => setShowEditDialog(true)}
                onTouch={handleTouch}
                onSubmitContextNotes={handleContextNotesSave}
                snsEditOpen={openSnsEdit}
                onSnsEditOpenChange={setOpenSnsEdit}
              />
            ) : (
              <EmptyPersona onScanClick={() => setShowScanner(true)} />
            )
          ) : (
            <RemindersPanel
              onClose={handleMobileClose}
              onSelect={id => {
                setSelectedId(id)
                setRightPanel('persona')
                // Stay in overlay — on mobile this swaps to PersonaCard,
                // on desktop it's ignored.
              }}
            />
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

      {selectedConnection && (
        <EditConnectionDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          connection={selectedConnection}
          onUpdated={handleConnectionUpdated}
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
  const t = useTranslations('connect.empty')
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
      <div className="w-12 h-12 rounded-full border border-border bg-secondary flex items-center justify-center">
        <Bell className="w-5 h-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{t('title')}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {t('bodyLine1')}
          <br />
          {t('bodyLine2')}
        </p>
      </div>
      <button
        onClick={onScanClick}
        className="text-xs text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
      >
        {t('scanCta')}
      </button>
    </div>
  )
}
