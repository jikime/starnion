"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import NextImage from "next/image"
import {
  LayoutDashboard,
  MessageCircle,
  Radio,
  Wallet,
  PieChart,
  TrendingUp,
  BookOpen,
  Target,
  StickyNote,
  Clock,
  Bell,
  FileBarChart,
  BarChart3,
  FileText,
  Image,
  Music,
  Search,
  Settings,
  Link2,
  BrainCircuit,
  UserCircle,
  Cog,
  ScrollText,
  Activity,
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
  { title: "채널", icon: Radio, href: "/channels" },
]

const financeNav = [
  { title: "가계부", icon: Wallet, href: "/finance" },
  { title: "예산 관리", icon: PieChart, href: "/budget" },
  { title: "소비 분석", icon: TrendingUp, href: "/statistics" },
]

const lifeNav = [
  { title: "일기", icon: BookOpen, href: "/diary" },
  { title: "목표 관리", icon: Target, href: "/goals" },
  { title: "디데이", icon: Clock, href: "/dday" },
  { title: "메모", icon: StickyNote, href: "/memo" },
]

const reportsNav = [
  { title: "리포트 센터", icon: FileBarChart, href: "/reports" },
  { title: "통계/분석", icon: BarChart3, href: "/analytics" },
]

const mediaNav = [
  { title: "문서", icon: FileText, href: "/documents" },
  { title: "이미지", icon: Image, href: "/images" },
  { title: "오디오", icon: Music, href: "/audio" },
]

const toolsNav = [
  { title: "웹검색", icon: Search, href: "/search" },
  { title: "스킬", icon: Cog, href: "/skills" },
]

const monitoringNav = [
  { title: "로그", icon: ScrollText, href: "/logs" },
  { title: "사용량", icon: Activity, href: "/usage" },
]

const settingsNav = [
  { title: "설정", icon: Settings, href: "/settings" },
  { title: "알림 센터", icon: Bell, href: "/cron" },
  { title: "모델", icon: BrainCircuit, href: "/models" },
  { title: "페르소나", icon: UserCircle, href: "/personas" },
  { title: "연동", icon: Link2, href: "/integrations" },
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
          <NextImage
            src="/brand_logo.webp"
            alt="StarPion"
            width={36}
            height={36}
            className="rounded-md object-contain"
            priority
          />
          <span className="text-lg font-semibold">StarPion</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup items={mainNav} />
        <NavGroup label="FINANCE" items={financeNav} />
        <NavGroup label="LIFE" items={lifeNav} />
        <NavGroup label="REPORTS" items={reportsNav} />
        <NavGroup label="MEDIA" items={mediaNav} />
        <NavGroup label="TOOLS" items={toolsNav} />
        <NavGroup label="MONITORING" items={monitoringNav} />
        <NavGroup label="SETTINGS" items={settingsNav} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
