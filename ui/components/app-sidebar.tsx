"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import NextImage from "next/image"
import { useTranslations } from "next-intl"
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

const mainNavItems = [
  { key: "dashboard", icon: LayoutDashboard, href: "/" },
  { key: "chat", icon: MessageCircle, href: "/chat" },
  { key: "channels", icon: Radio, href: "/channels" },
] as const

const financeNavItems = [
  { key: "finance", icon: Wallet, href: "/finance" },
  { key: "budget", icon: PieChart, href: "/budget" },
  { key: "statistics", icon: TrendingUp, href: "/statistics" },
] as const

const lifeNavItems = [
  { key: "diary", icon: BookOpen, href: "/diary" },
  { key: "goals", icon: Target, href: "/goals" },
  { key: "dday", icon: Clock, href: "/dday" },
  { key: "memo", icon: StickyNote, href: "/memo" },
] as const

const reportsNavItems = [
  { key: "reports", icon: FileBarChart, href: "/reports" },
  { key: "analytics", icon: BarChart3, href: "/analytics" },
] as const

const mediaNavItems = [
  { key: "documents", icon: FileText, href: "/documents" },
  { key: "images", icon: Image, href: "/images" },
  { key: "audio", icon: Music, href: "/audio" },
] as const

const toolsNavItems = [
  { key: "search", icon: Search, href: "/search" },
  { key: "skills", icon: Cog, href: "/skills" },
] as const

const monitoringNavItems = [
  { key: "logs", icon: ScrollText, href: "/logs" },
  { key: "usage", icon: Activity, href: "/usage" },
] as const

const settingsNavItems = [
  { key: "settings", icon: Settings, href: "/settings" },
  { key: "notifications", icon: Bell, href: "/cron" },
  { key: "models", icon: BrainCircuit, href: "/models" },
  { key: "personas", icon: UserCircle, href: "/personas" },
  { key: "integrations", icon: Link2, href: "/integrations" },
] as const

type NavItem = { key: string; icon: React.ComponentType<{ className?: string }>; href: string }

function NavGroup({
  label,
  items,
  pathname,
}: {
  label?: string
  items: readonly NavItem[]
  pathname: string
}) {
  const tNav = useTranslations("nav")
  return (
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
                    <span>{tNav(item.key as Parameters<typeof tNav>[0])}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const tGroups = useTranslations("groups")

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
        <NavGroup items={mainNavItems} pathname={pathname} />
        <NavGroup label={tGroups("finance")} items={financeNavItems} pathname={pathname} />
        <NavGroup label={tGroups("life")} items={lifeNavItems} pathname={pathname} />
        <NavGroup label={tGroups("reports")} items={reportsNavItems} pathname={pathname} />
        <NavGroup label={tGroups("media")} items={mediaNavItems} pathname={pathname} />
        <NavGroup label={tGroups("tools")} items={toolsNavItems} pathname={pathname} />
        <NavGroup label={tGroups("monitoring")} items={monitoringNavItems} pathname={pathname} />
        <NavGroup label={tGroups("settings")} items={settingsNavItems} pathname={pathname} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
