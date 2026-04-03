"use client"

import dynamic from "next/dynamic"

const ModelsView = dynamic(() => import("@/components/models-view").then(m => m.ModelsView), {
  ssr: false,
})

export default function ModelsPage() {
  return <ModelsView />
}
