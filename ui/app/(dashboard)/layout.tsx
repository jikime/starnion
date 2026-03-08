import { AppHeader } from "@/components/app-header"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-y-auto scrollbar-hide">
        {children}
      </main>
    </>
  )
}
