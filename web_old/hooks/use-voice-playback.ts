/**
 * useVoicePlayback — TTS playback hook.
 *
 * Tries OpenAI TTS via /api/audios/action (generate), falls back to the
 * browser's Web Speech API when no OpenAI key is configured (422 response).
 *
 * Usage:
 *   const { playingId, speak, stop } = useVoicePlayback()
 *   speak(message)   // msg: { id, text }
 *   stop()
 */
"use client"

import { useState, useCallback, useRef } from "react"

export type VoiceState = "idle" | "loading" | "playing"

export interface SpeakTarget {
  id: string
  text: string
}

export function useVoicePlayback() {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [voiceState, setVoiceState] = useState<VoiceState>("idle")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const stop = useCallback(() => {
    // Stop HTML Audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ""
      audioRef.current = null
    }
    // Revoke blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    // Stop Web Speech API
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
    setPlayingId(null)
    setVoiceState("idle")
  }, [])

  const speak = useCallback(async (target: SpeakTarget) => {
    // Toggle off if already playing this message
    if (playingId === target.id) {
      stop()
      return
    }
    stop()

    setPlayingId(target.id)
    setVoiceState("loading")

    try {
      const res = await fetch("/api/audios/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", text: target.text }),
      })

      // 422 = no OpenAI key → fall back to Web Speech API
      if (res.status === 422 || !res.ok) {
        throw new Error("tts_unavailable")
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url

      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        blobUrlRef.current = null
        audioRef.current = null
        setPlayingId(null)
        setVoiceState("idle")
      }
      audio.onerror = () => {
        stop()
      }

      setVoiceState("playing")
      await audio.play()
    } catch {
      // Fallback: Web Speech API
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
        const utt = new SpeechSynthesisUtterance(target.text)
        utt.lang = "ko-KR"
        utt.onend = () => {
          setPlayingId(null)
          setVoiceState("idle")
        }
        utt.onerror = () => {
          setPlayingId(null)
          setVoiceState("idle")
        }
        setVoiceState("playing")
        window.speechSynthesis.speak(utt)
      } else {
        setPlayingId(null)
        setVoiceState("idle")
      }
    }
  }, [playingId, stop])

  return { playingId, voiceState, speak, stop }
}
