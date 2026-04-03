import { cn } from "@/lib/utils"

const TOOL_BADGE_COLOR: Record<string, string> = {
  web_search: "bg-pink-500/20 text-pink-300 ring-pink-500/30",
  web_fetch: "bg-fuchsia-500/20 text-fuchsia-300 ring-fuchsia-500/30",
  get_weather: "bg-sky-500/20 text-sky-300 ring-sky-500/30",
}
const TOOL_DEFAULT_COLOR = "bg-violet-500/20 text-violet-300 ring-violet-500/30"
const TOOL_CALL_RE = /^(tool_call:\s*)(\S+)(.*)/s

export function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <span className="rounded-sm bg-amber-400/30 text-amber-200 ring-1 ring-amber-400/40">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  )
}

export function MessageContent({ text, q }: { text: string; q: string }) {
  const m = TOOL_CALL_RE.exec(text)
  if (!m) return <Highlight text={text} q={q} />
  const [, prefix, toolName, rest] = m
  const color = TOOL_BADGE_COLOR[toolName] ?? TOOL_DEFAULT_COLOR
  return (
    <>
      <span className="text-zinc-500">{prefix}</span>
      <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-px font-mono text-xs ring-1", color)}>
        ⚙ {toolName}
      </span>
      {rest && <Highlight text={rest} q={q} />}
    </>
  )
}
