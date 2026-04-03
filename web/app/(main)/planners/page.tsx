"use client"

import { useState, useEffect } from "react"
import { usePlannerStore } from "@/lib/planner-store"
import { Skeleton } from "@/components/ui/skeleton"
import { TabBar, type PlannerTab } from "@/components/planner/tab-bar"
import { DailyTab } from "@/components/planner/daily-tab"
import { WeeklyTab } from "@/components/planner/weekly-tab"
import { MonthlyTab } from "@/components/planner/monthly-tab"
import { GoalsTab } from "@/components/planner/goals-tab"
import { GuideTab } from "@/components/planner/guide-tab"
import { MonthSidebar } from "@/components/planner/month-sidebar"

function PlannerSkeleton() {
  return (
    <>
      {/* Sidebar skeleton */}
      <div className="w-20 shrink-0 border-r border-border bg-card/50 flex flex-col items-center py-4 gap-3">
        <Skeleton className="h-5 w-12" />
        <div className="flex flex-col gap-2 w-full px-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full rounded" />
          ))}
        </div>
      </div>
      {/* Main content skeleton */}
      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
        {/* Tab bar skeleton */}
        <div className="flex items-end gap-0 px-6 h-11 border-b border-border bg-card/60 shrink-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-16 mx-3 mb-3" />
          ))}
        </div>
        {/* Date header skeleton */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Skeleton className="w-7 h-7 rounded" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="w-7 h-7 rounded" />
          </div>
          <Skeleton className="h-8 w-48 rounded-lg" />
        </div>
        {/* Body: task list + time block */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Task list skeleton */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden border-r border-border">
            {/* Magic bar skeleton */}
            <div className="px-4 pt-3 pb-2 space-y-2 shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {["A", "B", "C"].map(p => (
                    <Skeleton key={p} className="w-8 h-9 rounded-md" />
                  ))}
                  <Skeleton className="w-14 h-9 rounded-md" />
                </div>
                <Skeleton className="h-9 flex-1 rounded-lg" />
                <Skeleton className="w-9 h-9 rounded-md" />
                <Skeleton className="w-16 h-9 rounded-lg" />
              </div>
            </div>
            {/* ABC groups skeleton */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
              {["A", "B", "C"].map(pri => (
                <div key={pri} className="space-y-2">
                  <div className="flex items-center gap-2 px-2">
                    <Skeleton className="w-6 h-6 rounded" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-2 flex-1 rounded-full" />
                  </div>
                  {Array.from({ length: pri === "A" ? 3 : 2 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <Skeleton className="w-4 h-4 rounded" />
                      <Skeleton className="w-4 h-4 rounded" />
                      <Skeleton className="h-3 flex-1" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {/* Time block skeleton */}
          <div className="flex flex-col w-72 shrink-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex-1 px-2 py-2 space-y-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 h-12">
                  <Skeleton className="w-10 h-3 shrink-0" />
                  <Skeleton className="h-full flex-1 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function PlannersPage() {
  const [activeTab, setActiveTab] = useState<PlannerTab>("daily")
  const [loading, setLoading] = useState(true)
  const hydrateFromAPI = usePlannerStore(s => s.hydrateFromAPI)

  useEffect(() => {
    hydrateFromAPI().finally(() => setLoading(false))
  }, [hydrateFromAPI])

  if (loading) return <PlannerSkeleton />

  return (
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
          {activeTab === "goals"   && <GoalsTab />}
          {activeTab === "guide"   && <GuideTab />}
        </div>
      </div>
    </>
  )
}
