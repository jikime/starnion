"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  MessageCircle,
  Wallet,
  PieChart,
  TrendingUp,
  BookOpen,
  Target,
  Calendar,
  StickyNote,
  Clock,
  FileBarChart,
  BarChart3,
  FileText,
  Image,
  Music,
  Search,
  Cloud,
  Wrench,
  Settings,
  Link2,
  Bot,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const mainNav = [
  { title: "대시보드", icon: LayoutDashboard, href: "/" },
  { title: "웹챗", icon: MessageCircle, href: "/chat" },
]

const financeNav = [
  { title: "가계부", icon: Wallet, href: "/finance" },
  { title: "예산 관리", icon: PieChart, href: "/budget" },
  { title: "소비 분석", icon: TrendingUp, href: "/analysis" },
]

const lifeNav = [
  { title: "일기", icon: BookOpen, href: "/diary" },
  { title: "목표 관리", icon: Target, href: "/goals" },
  { title: "일정/알림", icon: Calendar, href: "/schedule" },
  { title: "메모", icon: StickyNote, href: "/memo" },
  { title: "디데이", icon: Clock, href: "/dday" },
]

const reportsNav = [
  { title: "리포트 센터", icon: FileBarChart, href: "/reports" },
  { title: "통계/분석", icon: BarChart3, href: "/statistics" },
]

const mediaNav = [
  { title: "문서", icon: FileText, href: "/documents" },
  { title: "이미지", icon: Image, href: "/images" },
  { title: "오디오", icon: Music, href: "/audio" },
]

const toolsNav = [
  { title: "웹검색", icon: Search, href: "/search" },
  { title: "날씨", icon: Cloud, href: "/weather" },
  { title: "유틸리티", icon: Wrench, href: "/utilities" },
]

const settingsNav = [
  { title: "설정", icon: Settings, href: "/settings" },
  { title: "구글 연동", icon: Link2, href: "/settings/google" },
]

export function AppSidebar() {
  const pathname = usePathname()

  const NavGroup = ({ 
    label, 
    items 
  }: { 
    label?: string
    items: { title: string; icon: React.ComponentType<{ className?: string }>; href: string }[] 
  }) => (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <Link href={item.href}>
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border h-14">
        <Link href="/" className="flex items-center gap-2 px-4 py-1">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="size-5" />
          </div>
          <span className="text-lg font-semibold">JIKI</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup items={mainNav} />
        <NavGroup label="FINANCE" items={financeNav} />
        <NavGroup label="LIFE" items={lifeNav} />
        <NavGroup label="REPORTS" items={reportsNav} />
        <NavGroup label="MEDIA" items={mediaNav} />
        <NavGroup label="TOOLS" items={toolsNav} />
        <NavGroup label="SETTINGS" items={settingsNav} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
