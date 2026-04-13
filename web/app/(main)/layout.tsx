"use client"

import { useEffect, useState } from "react"
import { GlobalNav } from "@/components/global-nav"

/**
 * MainLayout fills the visible viewport with a non-scrolling app shell
 * whose first child is the sticky top header and whose second child is
 * a flex-1 region that hosts per-page content. Pages manage their own
 * internal scroll containers inside that region.
 *
 * Two mobile Chrome quirks are worth calling out:
 *
 *  1. `h-screen` (= 100vh) computes as the *largest* viewport — the
 *     size WITHOUT the URL bar. When the URL bar is visible at page
 *     load, the shell ends up taller than the visible area, body
 *     overflows, and the body itself becomes the scroll container —
 *     which drags the header off-screen even though it's marked
 *     `sticky top-0`. Switching to `h-dvh` (dynamic viewport height)
 *     makes the shell match the current visible area and eliminates
 *     the body overflow that caused the header to creep upward.
 *
 *  2. Even with `h-dvh`, a stray portaled child (dialog, sheet, etc.)
 *     can temporarily push <body> taller than 100dvh during a resize
 *     or animation. To make sure that never leaks through as a
 *     scroll on the root, we toggle a `main-shell-active` class on
 *     <body> while this layout is mounted; the matching rule in
 *     globals.css pins html+body to height:100% + overflow:hidden.
 *     The auth layout doesn't add this class, so its forms keep the
 *     normal body-scroll behaviour.
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Toggle the root-viewport lock on/off with the layout's lifetime so
  // auth pages (which mount a different layout) keep their normal
  // scroll behaviour. The class is safe to apply pre-mount too, so
  // the effect runs even when `mounted` is false.
  useEffect(() => {
    document.body.classList.add("main-shell-active")
    return () => {
      document.body.classList.remove("main-shell-active")
    }
  }, [])

  if (!mounted) {
    return (
      <div className="flex flex-col h-dvh bg-background text-foreground overflow-hidden">
        <div className="h-11 border-b border-border bg-card/80 shrink-0" />
        <div className="flex flex-1 overflow-hidden" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-dvh bg-background text-foreground overflow-hidden">
      <GlobalNav />
      <div className="flex flex-1 overflow-hidden min-h-0">
        {children}
      </div>
    </div>
  )
}
