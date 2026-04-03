"use client"
// cache-bust: v9

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { TabBar, type PlannerTab } from "./tab-bar"
import { DailyTab } from "./daily-tab"
import { WeeklyTab } from "./weekly-tab"
import { MonthlyTab } from "./monthly-tab"
import { YearlyTab } from "./yearly-tab"
import { GoalsTab } from "./goals-tab"
import { GuideTab } from "./guide-tab"
import { MonthSidebar } from "./month-sidebar"
import { DashboardSection, ChatSection, FilesSection } from "./journal-tab"
import { AssetsSection } from "./stats-tab"
import {
  LayoutDashboard,
  MessageSquare,
  FolderOpen,
  CalendarDays,
  BarChart3,
  Globe,
  Sun,
  Moon,
  Settings,
  UserCircle2,
  Search,
  Wrench,
  ScrollText,
  Activity,
  Bell,
  Cpu,
  UserSquare2,
} from "lucide-react"

type AppSection = "dashboard" | "chat" | "files" | "planner" | "assets"

const NAV_ITEMS: { id: AppSection; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "대시보드", icon: LayoutDashboard },
  { id: "chat",      label: "채팅",     icon: MessageSquare },
  { id: "files",     label: "내 파일",  icon: FolderOpen },
  { id: "planner",   label: "플래너",   icon: CalendarDays },
  { id: "assets",    label: "자산",     icon: BarChart3 },
]

interface GlobalNavProps {
  activeSection: AppSection
  onSectionChange: (s: AppSection) => void
}

// ── Settings Popover data ──────────────────────────────────────────────────

const SETTINGS_GROUPS = [
  {
    label: "TOOLS",
    items: [
      { icon: Search,      label: "웹검색" },
      { icon: Wrench,      label: "스킬" },
    ],
  },
  {
    label: "MONITORING",
    items: [
      { icon: ScrollText,  label: "로그" },
      { icon: Activity,    label: "사용량" },
    ],
  },
  {
    label: "SETTINGS",
    items: [
      { icon: Settings,    label: "설정" },
      { icon: Bell,        label: "알림 센터" },
      { icon: Cpu,         label: "모델" },
      { icon: UserSquare2, label: "페르소나" },
    ],
  },
]

// ── GlobalNav ──────────────────────────────────────────────────────────────

function GlobalNav({ activeSection, onSectionChange }: GlobalNavProps) {
  const [theme,       setTheme]       = useState<"dark" | "light">("dark")
  const [lang,        setLang]        = useState<"ko" | "en">("ko")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    document.documentElement.classList.toggle("dark", next === "dark")
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    if (settingsOpen) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [settingsOpen])

  return (
    <header className="flex items-center h-11 px-4 border-b border-border bg-card/80 backdrop-blur-sm shrink-0 z-10">
      {/* Logo */}
      <div className="flex items-center gap-2 w-44 shrink-0">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black tracking-tight select-none"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          FP
        </div>
        <span className="text-xs font-semibold tracking-wide text-foreground">Franklin Planner</span>
      </div>

      {/* Centre nav */}
      <nav className="flex items-center gap-0.5 mx-auto" aria-label="주 메뉴">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onSectionChange(id)}
            className={cn(
              "flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-colors",
              activeSection === id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {/* Right controls */}
      <div className="flex items-center gap-1 w-44 justify-end shrink-0">
        <button
          onClick={() => setLang((l) => (l === "ko" ? "en" : "ko"))}
          className="flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
          title="언어 변경"
        >
          <Globe className="w-3.5 h-3.5" />
          {lang.toUpperCase()}
        </button>
        <button
          onClick={toggleTheme}
          className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
          title={theme === "dark" ? "라이트 모드" : "다크 모드"}
        >
          {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        {/* Settings button + popover */}
        <div ref={settingsRef} className="relative">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
              settingsOpen
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
            )}
            title="설정"
            aria-expanded={settingsOpen}
            aria-haspopup="true"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {settingsOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden py-2"
              role="menu"
            >
              {SETTINGS_GROUPS.map((group, gi) => (
                <div key={group.label} className={cn(gi > 0 && "mt-1")}>
                  <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold tracking-widest text-muted-foreground">
                    {group.label}
                  </p>
                  {group.items.map(({ icon: Icon, label }) => (
                    <button
                      key={label}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-accent/50 transition-colors"
                      role="menuitem"
                      onClick={() => setSettingsOpen(false)}
                    >
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      {label}
                    </button>
                  ))}
                  {gi < SETTINGS_GROUPS.length - 1 && (
                    <div className="mt-1 border-b border-border" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
          title="프로필"
        >
          <UserCircle2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}

export function PlannerApp() {
  const [mounted,       setMounted]       = useState(false)
  const [activeTab,     setActiveTab]     = useState<PlannerTab>("daily")
  const [activeSection, setActiveSection] = useState<AppSection>("planner")

  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    return (
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        <div className="h-11 border-b border-border bg-card/80 shrink-0" />
        <div className="flex flex-1 overflow-hidden">
          <div className="w-20 shrink-0 border-r border-border bg-card/50" />
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="h-11 border-b border-border bg-card/60 shrink-0" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <GlobalNav activeSection={activeSection} onSectionChange={setActiveSection} />

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Non-planner sections fill full width */}
        {activeSection === "dashboard" && <DashboardSection />}
        {activeSection === "chat"      && <ChatSection />}
        {activeSection === "files"     && <FilesSection />}
        {activeSection === "assets"    && <AssetsSection />}

        {/* Planner section keeps sidebar + tabs */}
        {activeSection === "planner" && (
          <>
            <MonthSidebar />
            <div className="flex flex-col flex-1 overflow-hidden min-h-0">
              <TabBar active={activeTab} onChange={setActiveTab} />
              <div className="flex flex-col flex-1 overflow-hidden min-h-0">
                {activeTab === "daily"   && <DailyTab />}
                {activeTab === "weekly"  && <WeeklyTab onNavigateToDaily={() => setActiveTab("daily")} />}
                {activeTab === "monthly" && (
                  <MonthlyTab
                    onNavigateToDaily={() => setActiveTab("daily")}
                    onNavigateToWeekly={() => setActiveTab("weekly")}
                    onNavigateToMonthly={() => {}}
                  />
                )}
                {activeTab === "yearly"  && <YearlyTab />}
                {activeTab === "goals"   && <GoalsTab />}
                {activeTab === "guide"   && <GuideTab />}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
