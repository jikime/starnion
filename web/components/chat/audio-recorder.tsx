"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import WaveSurfer from "wavesurfer.js"
import RecordPlugin from "wavesurfer.js/dist/plugins/record"
import { Square, Play, Pause, Trash2, Check, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0")
  const s = Math.floor(secs % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

type RecordState = "requesting" | "recording" | "recorded" | "error"

interface AudioRecorderProps {
  /** Called when the user confirms attachment. Parent handles upload. */
  onAttach: (blob: Blob, mimeType: string) => void
  /** Called when the user cancels/deletes the recording. */
  onCancel: () => void
  /** Called when the user wants to transcribe audio to text. Parent handles STT. */
  onTranscribe?: (blob: Blob, mimeType: string) => void
  /** True while the parent is running STT — disables buttons and shows spinner. */
  isTranscribing?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AudioRecorder({ onAttach, onCancel, onTranscribe, isTranscribing = false }: AudioRecorderProps) {
  // Separate DOM nodes for recording and playback — never shared.
  const recordContainerRef = useRef<HTMLDivElement>(null)
  const playContainerRef   = useRef<HTMLDivElement>(null)

  const recordWsRef = useRef<WaveSurfer | null>(null)
  const playWsRef   = useRef<WaveSurfer | null>(null)
  const recordRef   = useRef<ReturnType<typeof RecordPlugin.create> | null>(null)
  const blobRef     = useRef<Blob | null>(null)
  const blobUrlRef  = useRef<string | null>(null)

  const [state,       setState]       = useState<RecordState>("requesting")
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [elapsed,     setElapsed]     = useState(0)
  const [duration,    setDuration]    = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [errorMsg,    setErrorMsg]    = useState("")

  useEffect(() => {
    if (!recordContainerRef.current || !playContainerRef.current) return

    // Resolve CSS custom properties to concrete values for WaveSurfer's Canvas.
    const style = getComputedStyle(document.documentElement)
    const fg      = style.getPropertyValue("--foreground").trim()
    const primary = style.getPropertyValue("--primary").trim()
    const waveColor     = fg      ? `color-mix(in srgb, ${fg} 25%, transparent)` : "rgba(0,0,0,0.25)"
    const progressColor = primary || "#3b6de0"

    // Shared base config for both instances.
    const baseConfig = {
      waveColor,
      progressColor,
      height: 36,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: true,
    }

    // active flag guards against React StrictMode double-mount:
    // record-end fires asynchronously AFTER cleanup, so we need to ignore it.
    let active = true

    // ── Recording WaveSurfer ──────────────────────────────────────────────────
    const recordWs = WaveSurfer.create({
      container: recordContainerRef.current!,
      ...baseConfig,
      cursorColor: "transparent",
    })
    recordWsRef.current = recordWs

    const record = recordWs.registerPlugin(
      RecordPlugin.create({ renderRecordedAudio: false, scrollingWaveform: true })
    )
    recordRef.current = record

    // ── Playback WaveSurfer — dedicated container, created eagerly ────────────
    // minPxPerSec zooms in so the waveform is wider than the container.
    // autoScroll + autoCenter keep the playhead centered while the waveform scrolls,
    // giving the same "flowing" effect as the live recording waveform.
    const playWs = WaveSurfer.create({
      container: playContainerRef.current!,
      ...baseConfig,
      cursorColor: "rgba(0,0,0,0.25)",
      minPxPerSec: 80,
      autoScroll: true,
      autoCenter: true,
      hideScrollbar: true,
    })
    playWsRef.current = playWs

    playWs.on("play",       () => setIsPlaying(true))
    playWs.on("pause",      () => setIsPlaying(false))
    playWs.on("finish",     () => { setIsPlaying(false); setCurrentTime(0) })
    playWs.on("ready",      (dur: number) => setDuration(dur))
    playWs.on("timeupdate", (t: number)   => setCurrentTime(t))

    // ── Start recording ───────────────────────────────────────────────────────
    record.startRecording().then(() => {
      if (active) setState("recording")
    }).catch((err: unknown) => {
      if (!active) return
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(
        msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")
          ? "마이크 권한이 필요합니다"
          : "녹음을 시작할 수 없습니다"
      )
      setState("error")
    })

    record.on("record-progress", (time: number) => {
      if (active) setElapsed(time / 1000)
    })

    record.on("record-end", (blob: Blob) => {
      if (!active) return  // Ignore if unmounted (StrictMode cleanup fired stopRecording)
      blobRef.current = blob
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      // Load into the already-initialised playback WaveSurfer — no destroy/recreate.
      playWs.load(url)
      setState("recorded")
    })

    return () => {
      active = false
      // Wrap in try/catch: StrictMode may call destroy twice on the same instance.
      try { recordWs.destroy() } catch { /* already destroyed */ }
      try { playWs.destroy()   } catch { /* already destroyed */ }
      recordWsRef.current = null
      playWsRef.current   = null
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    recordRef.current?.stopRecording()
  }, [])

  const togglePlay = useCallback(() => {
    playWsRef.current?.playPause()
  }, [])

  const handleAttach = useCallback(() => {
    if (blobRef.current) {
      onAttach(blobRef.current, blobRef.current.type || "audio/webm")
    }
  }, [onAttach])

  // ── Error state ──────────────────────────────────────────────────────────────

  if (state === "error") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <span className="flex-1">{errorMsg}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="h-6 px-2 text-xs">
          닫기
        </Button>
      </div>
    )
  }

  // ── Recording / playback state ────────────────────────────────────────────────

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
      {/* Live recording pulse indicator */}
      {state === "requesting" && (
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-muted-foreground" />
      )}
      {state === "recording" && (
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-destructive" />
        </span>
      )}

      {/*
        Two dedicated, always-mounted containers stacked via absolute positioning.
        Using CSS visibility (not display:none) so each WaveSurfer instance always
        knows its container dimensions — the key condition for correct progress rendering.
      */}
      <div className="relative min-w-0 flex-1 overflow-hidden" style={{ height: 36 }}>
        <div
          ref={recordContainerRef}
          className={cn("absolute inset-0", state === "recorded" && "invisible")}
        />
        <div
          ref={playContainerRef}
          className={cn("absolute inset-0", state !== "recorded" && "invisible")}
        />
      </div>

      {/* Timer: recording → elapsed | playing → currentTime | paused → total */}
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {state === "recorded"
          ? isPlaying ? formatTime(currentTime) : formatTime(duration)
          : formatTime(elapsed)}
      </span>

      {/* Controls */}
      {state === "recording" && (
        <Button
          type="button"
          size="icon"
          variant="destructive"
          className="size-7 shrink-0 rounded-full"
          onClick={stopRecording}
        >
          <Square className="size-3 fill-current" />
          <span className="sr-only">녹음 중지</span>
        </Button>
      )}

      {state === "recorded" && (
        <>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={isTranscribing}
            className="size-7 shrink-0 rounded-full"
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            <span className="sr-only">{isPlaying ? "일시정지" : "재생"}</span>
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={isTranscribing}
            className="size-7 shrink-0 rounded-full text-destructive hover:text-destructive"
            onClick={onCancel}
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">삭제</span>
          </Button>

          {onTranscribe && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={isTranscribing}
              title="텍스트로 변환"
              className="size-7 shrink-0 rounded-full text-primary hover:text-primary"
              onClick={() => blobRef.current && onTranscribe(blobRef.current, blobRef.current.type || "audio/webm")}
            >
              {isTranscribing
                ? <Loader2 className="size-3.5 animate-spin" />
                : <FileText className="size-3.5" />}
              <span className="sr-only">텍스트로 변환</span>
            </Button>
          )}

          <Button
            type="button"
            size="icon"
            disabled={isTranscribing}
            className="size-7 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/80"
            onClick={handleAttach}
          >
            <Check className="size-3.5" />
            <span className="sr-only">첨부</span>
          </Button>
        </>
      )}
    </div>
  )
}
