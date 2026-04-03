"use client"

import { useState } from "react"
import { TabBar, type PlannerTab } from "@/components/planner/tab-bar"
import { DailyTab } from "@/components/planner/daily-tab"
import { WeeklyTab } from "@/components/planner/weekly-tab"
import { MonthlyTab } from "@/components/planner/monthly-tab"
import { YearlyTab } from "@/components/planner/yearly-tab"
import { GoalsTab } from "@/components/planner/goals-tab"
import { GuideTab } from "@/components/planner/guide-tab"
import { MonthSidebar } from "@/components/planner/month-sidebar"

export default function PlannersPage() {
  const [activeTab, setActiveTab] = useState<PlannerTab>("daily")

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
          {activeTab === "yearly"  && <YearlyTab />}
          {activeTab === "goals"   && <GoalsTab />}
          {activeTab === "guide"   && <GuideTab />}
        </div>
      </div>
    </>
  )
}
