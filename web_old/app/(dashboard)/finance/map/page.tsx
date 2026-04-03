"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

const FinanceMapClient = dynamic(
  () => import("./_components/finance-map-client"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    ),
  }
)

export default function FinanceMapPage() {
  return <FinanceMapClient />
}
