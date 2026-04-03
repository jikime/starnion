"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isActionMismatch =
    error?.message?.includes("Failed to find Server Action")

  useEffect(() => {
    // After a new deployment the browser may hold a stale JS bundle whose
    // Server Action IDs no longer exist on the server.  Reloading fetches
    // the latest bundle and resolves the mismatch automatically.
    if (isActionMismatch) {
      window.location.reload()
    }
  }, [isActionMismatch])

  if (isActionMismatch) {
    return (
      <html>
        <body />
      </html>
    )
  }

  return (
    <html>
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
        <h2 className="text-xl font-semibold">오류가 발생했습니다</h2>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          다시 시도
        </button>
      </body>
    </html>
  )
}
