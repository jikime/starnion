"use client"

import { useSession } from "next-auth/react"
import { useTranslations } from "next-intl"
import { Skeleton } from "@/components/ui/skeleton"
import { UserCircle2, Mail } from "lucide-react"

export default function ProfilePage() {
  const { data: session, status } = useSession()

  if (status === "loading") {
    return (
      <div className="flex flex-col flex-1 overflow-auto bg-background">
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  const user = session?.user
  const t = useTranslations("profile")

  return (
    <div className="flex flex-col flex-1 overflow-auto bg-background">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-lg font-bold text-foreground mb-6">{t("title")}</h1>

        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center shrink-0">
              <UserCircle2 className="w-10 h-10 text-muted-foreground" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{user?.name ?? "Unknown"}</p>
              <p className="text-sm text-muted-foreground">{user?.email ?? ""}</p>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Info rows */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("email")}</p>
                <p className="text-sm text-foreground">{user?.email ?? "-"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <UserCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("name")}</p>
                <p className="text-sm text-foreground">{user?.name ?? "-"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
