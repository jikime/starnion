import { AppHeaderClient } from "@/components/app-header-client"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <AppHeaderClient />
      <main className="flex-1 overflow-y-auto scrollbar-hide">
        {children}
      </main>
    </>
  )
}
