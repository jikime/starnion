"use client"

import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import { CodeBlock } from "@/components/chat/code-block"
import { DocDownloadCard, DOC_FILE_RE } from "@/components/chat/file-preview"
import type { ChatMessage } from "@/hooks/use-chat"

// `Components` is exported by react-markdown and carries the proper
// per-tag prop signature (href, children, className, …) so we no longer
// need `any` for these overrides.
const markdownComponents: Components = {
  a: ({ href, children, ...props }) => {
    if (href && DOC_FILE_RE.test(href)) {
      const label = typeof children === "string"
        ? children
        : Array.isArray(children) ? children.join("") : String(children ?? "")
      return <DocDownloadCard href={href} label={label} />
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
  },
  // pre wrapper removed — CodeBlock has its own pre
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "")
    const raw = Array.isArray(children) ? children.join("") : String(children ?? "")
    const isBlock = !!match || raw.includes("\n")
    if (!isBlock) {
      return <code className={className} {...props}>{children}</code>
    }
    const lang = match?.[1] ?? "text"
    const code = raw.replace(/\n$/, "")
    return <CodeBlock language={lang} code={code} />
  },
}

/** Assistant message body — renders markdown text only */
export function AssistantBody({ message }: { message: ChatMessage }) {
  return (
    <div className="chat-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={markdownComponents}
      >
        {message.text}
      </ReactMarkdown>
      {message.streaming && (
        <span className="inline-block h-3.5 w-0.5 animate-pulse bg-foreground align-middle" />
      )}
    </div>
  )
}
