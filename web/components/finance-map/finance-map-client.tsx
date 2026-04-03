"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, MapPin, Loader2, List, X } from "lucide-react"
import { cn } from "@/lib/utils"

// Naver Maps v3 global types (loaded via script tag)
declare global {
  interface Window {
    naver: typeof naver
  }
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace naver {
    namespace maps {
      class Map {
        constructor(element: HTMLElement | string, options?: MapOptions)
        setCenter(latlng: LatLng): void
        setZoom(zoom: number): void
        fitBounds(bounds: LatLngBounds, options?: { top?: number; right?: number; bottom?: number; left?: number }): void
        destroy(): void
      }
      class LatLng {
        constructor(lat: number, lng: number)
        lat(): number
        lng(): number
      }
      class LatLngBounds {
        constructor(sw: LatLng, ne: LatLng)
        extend(latlng: LatLng): void
        getCenter(): LatLng
        hasLatLng(latlng: LatLng): boolean
      }
      class Marker {
        constructor(options: MarkerOptions)
        setMap(map: Map | null): void
        setIcon(icon: MarkerIcon): void
        addListener(event: string, handler: () => void): void
      }
      class InfoWindow {
        constructor(options: InfoWindowOptions)
        open(map: Map, marker: Marker): void
        close(): void
      }
      namespace Event {
        function trigger(target: Map, eventName: string): void
      }
      namespace Service {
        enum Status { OK = "OK", ERROR = "ERROR" }
        interface GeocodeAddress {
          x: string; y: string
          roadAddress: string; jibunAddress: string
        }
        interface GeocodeResponse {
          v2: { meta: { totalCount: number }; addresses: GeocodeAddress[] }
        }
        function geocode(
          options: { query: string },
          callback: (status: Status, response: GeocodeResponse) => void
        ): void
      }
      interface MapOptions {
        center?: LatLng
        zoom?: number
        minZoom?: number
        zoomControl?: boolean
        mapTypeControl?: boolean
        mapDataControl?: boolean
        disableKineticPan?: boolean
      }
      interface MarkerOptions {
        position: LatLng
        map?: Map
        icon?: MarkerIcon
        title?: string
      }
      interface MarkerIcon {
        content: string
        anchor: Point
      }
      class Point {
        constructor(x: number, y: number)
      }
      interface InfoWindowOptions {
        content: string
        borderWidth?: number
        borderColor?: string
        backgroundColor?: string
        disableAnchor?: boolean
        pixelOffset?: Point
      }
    }
  }
}

interface Location { lat?: number; lng?: number; name?: string }
interface MapTransaction {
  id: number; amount: number; category: string
  description?: string; created_at: string; location: Location
}

const CATEGORY_COLORS: Record<string, string> = {
  식비: "#ef4444", 교통: "#3b82f6", 쇼핑: "#f97316",
  문화: "#8b5cf6", 의료: "#10b981", 교육: "#eab308",
  공과금: "#64748b", 기타: "#6b7280",
}
const categoryColor = (cat: string) => CATEGORY_COLORS[cat] ?? "#6b7280"
const formatAmount = (amount: number) => `${Math.abs(amount).toLocaleString()}원`

function makeMarkerIcon(color: string, size: number, selected: boolean): naver.maps.MarkerIcon {
  const half = size / 2
  const borderWidth = selected ? 3 : 2
  const shadow = selected
    ? "0 3px 10px rgba(0,0,0,.6)"
    : "0 2px 6px rgba(0,0,0,.4)"
  const outline = selected ? `outline:3px solid ${color};outline-offset:2px;` : ""
  return {
    content: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:${borderWidth}px solid white;
      box-shadow:${shadow};cursor:pointer;${outline}
    "></div>`,
    anchor: new window.naver.maps.Point(half, half),
  }
}

type IntegrationStatus = "loading" | "not_configured" | "ready"

export default function FinanceMapClient() {
  const t = useTranslations("nav")
  const tm = useTranslations("finance.map")
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [transactions, setTransactions] = useState<MapTransaction[]>([])
  const [loading, setLoading]             = useState(false)
  const [map, setMap]                     = useState<naver.maps.Map | null>(null)
  const [mapError, setMapError]           = useState<string | null>(null)
  const [selected, setSelected]           = useState<MapTransaction | null>(null)
  const [integration, setIntegration]     = useState<IntegrationStatus>("loading")
  const [searchConfigured, setSearchConfigured] = useState(true)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  const markersRef    = useRef<Map<number, { marker: naver.maps.Marker; openInfo: () => void; category: string; amount: number; baseSize: number }>>(new Map())
  const infoWindowRef = useRef<naver.maps.InfoWindow | null>(null)
  const selectedIdRef = useRef<number | null>(null)

  // ── 1단계: naver_map 스킬 설정 확인 → 키 로드 → 지도 초기화 ────────────
  useEffect(() => {
    let script: HTMLScriptElement | null = null

    async function initMap() {
      try {
        const res = await fetch("/api/integrations/naver-map/client-config")
        const data = await res.json()

        if (!data.configured) {
          setIntegration("not_configured")
          return
        }

        const { client_id, search_configured } = data as { client_id: string; search_configured: boolean }
        setSearchConfigured(search_configured ?? false)
        setIntegration("ready")

        script = document.createElement("script")
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${client_id}&submodules=geocoder`
        script.async = true
        script.onload = () => {
          if (typeof naver !== "undefined") {
            const mapInstance = new naver.maps.Map("naver-finance-map", {
              center: new naver.maps.LatLng(37.566, 126.978),
              zoom: 11,
              minZoom: 6,
              zoomControl: false,
              mapDataControl: false,
              disableKineticPan: false,
            })
            setMap(mapInstance)
          }
        }
        script.onerror = () => setMapError(tm("scriptLoadFailed"))
        document.head.appendChild(script)
      } catch {
        setMapError(tm("configLoadFailed"))
      }
    }

    initMap()

    return () => {
      if (script && document.head.contains(script)) {
        document.head.removeChild(script)
      }
    }
  }, [])

  // ── dev-maps 와 동일: 지도 resize 트리거 ──────────────────────────────
  useEffect(() => {
    if (map && typeof naver !== "undefined") {
      const timer = setTimeout(() => {
        naver.maps.Event.trigger(map, "resize")
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [map])

  // ── 마커 관련 ──────────────────────────────────────────────────────────
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(({ marker }) => marker.setMap(null))
    markersRef.current = new Map()
    infoWindowRef.current?.close()
  }, [])

  const openInfoWindow = useCallback((tx: MapTransaction, mapInst: naver.maps.Map, marker: naver.maps.Marker) => {
    infoWindowRef.current?.close()
    const iw = new naver.maps.InfoWindow({
      content: `<div style="padding:8px 12px;min-width:140px;font-size:13px;line-height:1.6;
        background:hsl(var(--background));color:hsl(var(--foreground));border-radius:4px">
        <strong>${tx.location.name ?? tx.category}</strong><br>
        <span style="color:hsl(var(--muted-foreground))">${tx.category} · ${new Date(tx.created_at).toLocaleDateString("ko-KR")}</span><br>
        <span style="color:${tx.amount < 0 ? "#ef4444" : "#10b981"};font-weight:700">
          ${tx.amount < 0 ? "-" : "+"}${formatAmount(tx.amount)}
        </span>
      </div>`,
      borderWidth: 1,
      borderColor: "hsl(var(--border))",
      backgroundColor: "hsl(var(--background))",
      disableAnchor: false,
      pixelOffset: new naver.maps.Point(0, -10),
    })
    iw.open(mapInst, marker)
    infoWindowRef.current = iw
  }, [])

  const placeMarkers = useCallback((txs: MapTransaction[], mapInst: naver.maps.Map) => {
    clearMarkers()

    // 금액 범위 계산 (비례 크기용)
    const amounts = txs.map((tx) => Math.abs(tx.amount))
    const minAmt = Math.min(...amounts)
    const maxAmt = Math.max(...amounts)
    const minSize = 16
    const maxSize = 36
    const calcSize = (amount: number) => {
      if (maxAmt === minAmt) return 24
      return Math.round(minSize + (maxSize - minSize) * (Math.abs(amount) - minAmt) / (maxAmt - minAmt))
    }

    let minLat = Infinity, maxLat = -Infinity
    let minLng = Infinity, maxLng = -Infinity

    txs.forEach((tx) => {
      const { lat, lng } = tx.location
      if (!lat || !lng) return

      const size = calcSize(tx.amount)
      const position = new naver.maps.LatLng(lat, lng)
      const marker = new naver.maps.Marker({
        position,
        map: mapInst,
        icon: makeMarkerIcon(categoryColor(tx.category), size, false),
        title: tx.location.name ?? tx.category,
      })

      const openInfo = () => {
        // 이전 선택 마커를 원래 크기로 복원
        if (selectedIdRef.current !== null && selectedIdRef.current !== tx.id) {
          const prev = markersRef.current.get(selectedIdRef.current)
          if (prev) {
            prev.marker.setIcon(makeMarkerIcon(categoryColor(prev.category), prev.baseSize, false))
          }
        }
        // 현재 마커 강조
        marker.setIcon(makeMarkerIcon(categoryColor(tx.category), Math.round(size * 1.4), true))
        selectedIdRef.current = tx.id
        openInfoWindow(tx, mapInst, marker)
        setSelected(tx)
      }

      marker.addListener("click", openInfo)
      markersRef.current.set(tx.id, { marker, openInfo, category: tx.category, amount: tx.amount, baseSize: size })

      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
    })

    if (minLat !== Infinity) {
      const sw = new naver.maps.LatLng(minLat, minLng)
      const ne = new naver.maps.LatLng(maxLat, maxLng)
      mapInst.fitBounds(new naver.maps.LatLngBounds(sw, ne), { top: 50, right: 50, bottom: 50, left: 50 })
    }
  }, [clearMarkers, openInfoWindow])

  // ── 카테고리 필터: activeCategory 변경 시 마커 표시/숨김 ─────────────
  useEffect(() => {
    if (typeof naver === "undefined" || !map) return
    markersRef.current.forEach(({ marker, category }) => {
      if (!activeCategory || category === activeCategory) {
        marker.setMap(map)
      } else {
        marker.setMap(null)
      }
    })
  }, [activeCategory, map])

  // ── 이름만 있는 거래를 브라우저 geocoder로 좌표 보완 ──────────────────
  const geocodeNameOnly = useCallback((txs: MapTransaction[]): Promise<MapTransaction[]> => {
    const nameOnly = txs.filter((tx) => !tx.location.lat && tx.location.name)
    if (nameOnly.length === 0 || typeof naver === "undefined") return Promise.resolve(txs)

    return Promise.all(
      nameOnly.map(
        (tx) =>
          new Promise<{ id: number; lat: number; lng: number } | null>((resolve) => {
            naver.maps.Service.geocode({ query: tx.location.name! }, (status, response) => {
              if (
                status !== naver.maps.Service.Status.OK ||
                response.v2.meta.totalCount === 0
              ) {
                resolve(null)
                return
              }
              const addr = response.v2.addresses[0]
              resolve({ id: tx.id, lat: parseFloat(addr.y), lng: parseFloat(addr.x) })
            })
          })
      )
    ).then((results) => {
      const geoMap = new Map(
        results.filter(Boolean).map((g) => [g!.id, g!])
      )
      return txs.map((tx) => {
        const geo = geoMap.get(tx.id)
        return geo
          ? { ...tx, location: { ...tx.location, lat: geo.lat, lng: geo.lng } }
          : tx
      })
    })
  }, [])

  // ── 트랜잭션 fetch ─────────────────────────────────────────────────────
  const fetchTransactions = useCallback(async (mapInst: naver.maps.Map | null) => {
    setLoading(true); setSelected(null); setActiveCategory(null)
    selectedIdRef.current = null
    try {
      const res = await fetch(`/api/finance/map?year=${year}&month=${month}`)
      if (!res.ok) throw new Error("fetch failed")
      const data = await res.json()
      // 이름 내림차순 정렬
      const sorted: MapTransaction[] = (data.transactions ?? []).sort(
        (a: MapTransaction, b: MapTransaction) => {
          const nameA = a.location?.name ?? a.category
          const nameB = b.location?.name ?? b.category
          return nameB.localeCompare(nameA, "ko")
        }
      )
      // 이름만 있는 항목을 브라우저 geocoder로 좌표 보완
      const txs = await geocodeNameOnly(sorted)
      setTransactions(txs)
      // 지도 마커: 좌표 있는 거래만
      const geoTxs = txs.filter((tx) => tx.location.lat && tx.location.lng)
      if (mapInst && geoTxs.length > 0) {
        try { placeMarkers(geoTxs, mapInst) } catch (e) { console.error("[Map] placeMarkers:", e) }
      }
    } catch { setTransactions([]) }
    finally { setLoading(false) }
  }, [year, month, placeMarkers, geocodeNameOnly])

  // 지도가 준비되면 fetch (map state 사용)
  useEffect(() => {
    if (map) { fetchTransactions(map) }
  }, [map, fetchTransactions])

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12) }
    else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    const cur = new Date(year, month - 1)
    if (cur >= new Date(new Date().getFullYear(), new Date().getMonth())) return
    if (month === 12) { setYear((y) => y + 1); setMonth(1) }
    else setMonth((m) => m + 1)
  }

  const totalExpense = transactions.filter((tx) => tx.amount < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0)
  const totalIncome  = transactions.filter((tx) => tx.amount > 0).reduce((s, tx) => s + tx.amount, 0)
  const mappedCount  = transactions.filter((tx) => tx.location.lat && tx.location.lng).length
  const categories   = Array.from(new Set(transactions.map((tx) => tx.category)))

  // 카테고리 필터 적용된 거래 목록
  const filteredTransactions = activeCategory
    ? transactions.filter((tx) => tx.category === activeCategory)
    : transactions

  // 위치 없는 거래 비율이 50% 이상일 때 온보딩 안내
  const noLocationCount = transactions.length - mappedCount
  const showLocationHint = transactions.length > 0 && noLocationCount >= Math.ceil(transactions.length * 0.5)

  // ── 미설정 안내 페이지 ──────────────────────────────────────────────────
  if (integration === "not_configured") {
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem)] items-center justify-center gap-6 px-4">
        <div className="text-center max-w-sm">
          <MapPin className="size-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold mb-2">{tm("noApiKeyTitle")}</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {tm("noApiKeyDesc")}
          </p>
          <a
            href="/settings/skills"
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {tm("goToSkillSettings")}
          </a>
        </div>
      </div>
    )
  }

  return (
    // dev-maps 와 동일: 전체 높이를 명시적으로 지정
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 md:px-4 md:py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-2 mr-auto">
          <MapPin className="size-5 text-primary shrink-0" />
          <h1 className="font-semibold text-base md:text-lg whitespace-nowrap">{t("finance_map")}</h1>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          <Button variant="outline" size="icon" className="size-8 md:size-9" onClick={prevMonth}><ChevronLeft className="size-4" /></Button>
          <span className="text-xs md:text-sm font-medium w-20 md:w-24 text-center">{tm("monthLabel", { year, month })}</span>
          <Button variant="outline" size="icon" className="size-8 md:size-9" onClick={nextMonth}><ChevronRight className="size-4" /></Button>
          <Button variant="outline" size="sm" className="h-8 md:h-9 px-2 md:px-3 text-xs md:text-sm" onClick={() => fetchTransactions(map)} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : tm("refresh")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8 md:hidden"
            onClick={() => setMobileDrawerOpen((o) => !o)}
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      {/* naver_search 미설정 경고 배너 */}
      {!searchConfigured && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs shrink-0">
          <span className="font-medium">⚠️</span>
          <span>
            {tm("noSearchApiWarning")}{" "}
            <a href="/settings/skills" className="underline font-medium hover:text-amber-900">
              {tm("goToSkillSettings")}
            </a>
          </span>
        </div>
      )}

      {/* Body: map + side panel */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Map */}
        <div className="flex-1 h-full relative">
          <div id="naver-finance-map" className="w-full h-full" />

          {!map && !mapError && (
            <div className="absolute inset-0 flex items-center justify-center z-[1000] bg-background/60">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          )}

          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center z-[1000]">
              <div className="bg-background/90 rounded-lg px-6 py-4 text-center shadow max-w-sm">
                <p className="text-sm font-medium text-destructive mb-1">{tm("mapLoadFailed")}</p>
                <p className="text-xs text-muted-foreground">{mapError}</p>
                <button className="mt-3 text-xs text-primary underline" onClick={() => window.location.reload()}>
                  {tm("retry")}
                </button>
              </div>
            </div>
          )}

          {map && transactions.length === 0 && !loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
              <div className="bg-background/90 rounded-lg px-6 py-4 text-center shadow">
                <MapPin className="size-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{tm("noLocationTransactions")}</p>
                <p className="text-xs text-muted-foreground mt-1">{tm("addLocationHint")}</p>
              </div>
            </div>
          )}

          {map && transactions.length > 0 && !loading && !transactions.some((tx) => tx.location.lat) && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none z-[1000]">
              <div className="bg-background/90 rounded-lg px-4 py-2 text-center shadow border text-xs text-muted-foreground">
                {tm("nameOnlyNotice")}
              </div>
            </div>
          )}

          {/* 위치 없는 거래 온보딩 안내 (50% 이상) */}
          {map && showLocationHint && !loading && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
              <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-2 text-xs text-amber-800 dark:text-amber-300 shadow text-center">
                💡 {tm("noLocationWarning", { count: noLocationCount })}{" "}
                <Link href="/finance" className="underline pointer-events-auto font-medium">
                  {tm("addLocationLink")}
                </Link>
                {tm("addLocationSuffix")}
              </div>
            </div>
          )}

          {/* Selected popup (mobile) */}
          {selected && (
            <div className="absolute bottom-4 left-4 right-4 md:hidden bg-background rounded-xl shadow-lg border p-4 z-[1000]">
              <button className="absolute top-2 right-2 text-muted-foreground hover:text-foreground text-sm"
                onClick={() => { setSelected(null); infoWindowRef.current?.close() }}>✕</button>
              <div className="flex items-start gap-3">
                <div className="size-8 rounded-full shrink-0 mt-0.5" style={{ background: categoryColor(selected.category) }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{selected.location.name ?? selected.category}</p>
                  <p className="text-xs text-muted-foreground">{selected.category} · {new Date(selected.created_at).toLocaleDateString("ko-KR")}</p>
                  {selected.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{selected.description}</p>}
                  <p className={cn("font-bold mt-1", selected.amount < 0 ? "text-rose-500" : "text-emerald-500")}>
                    {selected.amount < 0 ? "-" : "+"}{formatAmount(selected.amount)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Side panel (desktop) */}
        <div className="w-64 border-l bg-background shrink-0 hidden md:flex flex-col">
          {/* 통계 헤더 */}
          <div className="p-3 border-b">
            <p className="text-xs font-medium text-muted-foreground">{tm("monthlyLocationExpense")}</p>
            <p className="text-xl font-bold text-rose-500 mt-0.5">{formatAmount(totalExpense)}</p>
            {totalIncome > 0 && (
              <p className="text-xs font-medium text-emerald-500 mt-0.5">+{formatAmount(totalIncome)} {tm("incomeLabel")}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {tm("mappedCount", { mapped: mappedCount, total: transactions.length })}
            </p>
          </div>

          {/* 카테고리 필터 */}
          {categories.length > 0 && (
            <div className="p-3 border-b">
              <p className="text-xs font-medium text-muted-foreground mb-2">{tm("categories")}</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory((prev) => prev === cat ? null : cat)}
                    className={cn(
                      "inline-flex items-center gap-1 text-xs rounded-full border px-2 py-0.5 transition-colors",
                      activeCategory === cat
                        ? "text-white font-medium"
                        : "bg-background hover:bg-muted text-foreground"
                    )}
                    style={{
                      borderColor: categoryColor(cat),
                      backgroundColor: activeCategory === cat ? categoryColor(cat) : undefined,
                    }}
                  >
                    <span
                      className="size-2 rounded-full inline-block"
                      style={{ background: activeCategory === cat ? "rgba(255,255,255,0.8)" : categoryColor(cat) }}
                    />
                    {cat}
                  </button>
                ))}
                {activeCategory && (
                  <button
                    onClick={() => setActiveCategory(null)}
                    className="inline-flex items-center gap-1 text-xs rounded-full border px-2 py-0.5 text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <X className="size-2.5" />{tm("allFilter")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 거래 목록 */}
          <div className="flex-1 overflow-y-auto">
            {filteredTransactions.map((tx) => (
              <div key={tx.id} className="relative group">
                <button
                  onClick={() => {
                    setSelected(tx)
                    const { lat, lng } = tx.location
                    if (map && lat != null && lng != null) {
                      map.setCenter(new naver.maps.LatLng(lat, lng))
                      map.setZoom(15)
                      markersRef.current.get(tx.id)?.openInfo()
                    }
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b hover:bg-muted/50 transition-colors",
                    selected?.id === tx.id && "bg-muted",
                    !tx.location.lat && "opacity-70 cursor-default"
                  )}
                >
                  <div className="flex items-center gap-2 pr-6">
                    <div className="size-2 rounded-full shrink-0" style={{ background: categoryColor(tx.category) }} />
                    <span className="text-xs font-medium truncate flex-1">{tx.location.name ?? tx.category}</span>
                    <span className={cn("text-xs font-bold shrink-0", tx.amount < 0 ? "text-rose-500" : "text-emerald-500")}>
                      {tx.amount < 0 ? "-" : "+"}{formatAmount(tx.amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 ml-4 mt-0.5">
                    <p className="text-xs text-muted-foreground">
                      {tx.category} · {new Date(tx.created_at).toLocaleDateString("ko-KR")}
                    </p>
                    {!tx.location.lat && (
                      <span className="text-xs text-muted-foreground/60 border border-muted-foreground/30 rounded px-1">{tm("noCoords")}</span>
                    )}
                  </div>
                </button>
                {/* 가계부 링크 (hover) */}
                <Link
                  href={`/finance?category=${encodeURIComponent(tx.category)}`}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary border border-primary/30 rounded px-1.5 py-0.5 hover:bg-primary/10"
                >
                  {tm("financeLink")}
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* 모바일 드로어 (bottom sheet) */}
        {mobileDrawerOpen && (
          <div className="absolute inset-0 z-[2000] md:hidden flex flex-col justify-end">
            {/* 배경 오버레이 */}
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileDrawerOpen(false)} />
            {/* 시트 */}
            <div className="relative bg-background rounded-t-2xl shadow-2xl flex flex-col max-h-[70vh]">
              {/* 핸들 바 */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-muted-foreground/30" />
              {/* 헤더 */}
              <div className="flex items-center justify-between px-4 pt-5 pb-2 shrink-0">
                <div>
                  <p className="text-sm font-semibold">{tm("transactionListTitle")}</p>
                  <p className="text-xs text-muted-foreground">{tm("mappedCount", { mapped: mappedCount, total: transactions.length })}</p>
                </div>
                <button onClick={() => setMobileDrawerOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                  <X className="size-4" />
                </button>
              </div>
              {/* 통계 */}
              <div className="px-4 pb-3 flex gap-6 shrink-0 border-b">
                <div>
                  <p className="text-xs text-muted-foreground">{tm("expenseLabel")}</p>
                  <p className="text-sm font-bold text-rose-500">{formatAmount(totalExpense)}</p>
                </div>
                {totalIncome > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">{tm("incomeLabel")}</p>
                    <p className="text-sm font-bold text-emerald-500">+{formatAmount(totalIncome)}</p>
                  </div>
                )}
              </div>
              {/* 카테고리 필터 */}
              {categories.length > 0 && (
                <div className="px-4 py-2 flex flex-wrap gap-1.5 border-b shrink-0">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory((prev) => prev === cat ? null : cat)}
                      className={cn(
                        "inline-flex items-center gap-1 text-xs rounded-full border px-2 py-0.5 transition-colors",
                        activeCategory === cat ? "text-white font-medium" : "bg-background hover:bg-muted text-foreground"
                      )}
                      style={{
                        borderColor: categoryColor(cat),
                        backgroundColor: activeCategory === cat ? categoryColor(cat) : undefined,
                      }}
                    >
                      <span
                        className="size-2 rounded-full inline-block"
                        style={{ background: activeCategory === cat ? "rgba(255,255,255,0.8)" : categoryColor(cat) }}
                      />
                      {cat}
                    </button>
                  ))}
                  {activeCategory && (
                    <button onClick={() => setActiveCategory(null)} className="text-xs text-muted-foreground border rounded-full px-2 py-0.5 hover:bg-muted">
                      {tm("allFilter")}
                    </button>
                  )}
                </div>
              )}
              {/* 거래 목록 */}
              <div className="overflow-y-auto flex-1">
                {filteredTransactions.map((tx) => (
                  <button
                    key={tx.id}
                    onClick={() => {
                      setMobileDrawerOpen(false)
                      setSelected(tx)
                      const { lat, lng } = tx.location
                      if (map && lat != null && lng != null) {
                        map.setCenter(new naver.maps.LatLng(lat, lng))
                        map.setZoom(15)
                        markersRef.current.get(tx.id)?.openInfo()
                      }
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors",
                      selected?.id === tx.id && "bg-muted",
                      !tx.location.lat && "opacity-70"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="size-3 rounded-full shrink-0" style={{ background: categoryColor(tx.category) }} />
                      <span className="text-sm font-medium truncate flex-1">{tx.location.name ?? tx.category}</span>
                      <span className={cn("text-sm font-bold shrink-0", tx.amount < 0 ? "text-rose-500" : "text-emerald-500")}>
                        {tx.amount < 0 ? "-" : "+"}{formatAmount(tx.amount)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground ml-5 mt-0.5">
                      {tx.category} · {new Date(tx.created_at).toLocaleDateString("ko-KR")}
                      {!tx.location.lat && ` · ${tm("noLocation")}`}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
