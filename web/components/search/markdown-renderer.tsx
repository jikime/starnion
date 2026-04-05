import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import { Separator } from "@/components/ui/separator"

export function Md({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80">
            {children}
          </a>
        ),
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => <h1 className="mb-2 text-lg font-bold">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 text-base font-semibold">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold">{children}</h3>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-")
          return isBlock
            ? <code className="block rounded-md bg-muted px-3 py-2 text-xs font-mono my-2 overflow-x-auto">{children}</code>
            : <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{children}</code>
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground my-2">
            {children}
          </blockquote>
        ),
        hr: () => <Separator className="my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
