"use client"

import { useState } from "react"
import { createLowlight, common } from "lowlight"
import { toHtml } from "hast-util-to-html"
import DOMPurify from "dompurify"
import { Copy, Check } from "lucide-react"

const lowlight = createLowlight(common)

export function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="code-block not-prose my-4">
      <div className="code-block-header">
        {/* macOS traffic light dots */}
        <div className="code-block-dots">
          <span className="dot dot-red" />
          <span className="dot dot-yellow" />
          <span className="dot dot-green" />
        </div>
        {/* language badge — centered */}
        <span className="code-block-lang">{language}</span>
        {/* copy button */}
        <button onClick={handleCopy} className="code-block-copy" title="Copy code">
          {copied
            ? <><Check className="size-3" /><span>Copied!</span></>
            : <><Copy className="size-3" /><span>Copy</span></>
          }
        </button>
      </div>
      <pre className="code-block-pre">
        <code dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(toHtml(
            lowlight.registered(language)
              ? lowlight.highlight(language, code)
              : lowlight.highlightAuto(code)
          ))
        }} />
      </pre>
    </div>
  )
}
