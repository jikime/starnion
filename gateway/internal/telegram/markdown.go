package telegram

import (
	"fmt"
	"html"
	"regexp"
	"strings"
)

// Compiled patterns used by markdownToTelegramHTML.
// All patterns are anchored to avoid partial matches where possible.
var (
	// Fenced code blocks: ```[lang]\ncontent\n```
	reMDFencedCode = regexp.MustCompile("(?s)```[a-zA-Z0-9+#.-]*\n?(.*?)```")
	// Inline code: `text`
	reMDInlineCode = regexp.MustCompile("`([^`\n]+)`")
	// Markdown links: [text](url)
	reMDLink = regexp.MustCompile(`\[([^\]\n]+)\]\((https?://[^)\n]+)\)`)
	// Headings: # / ## / ###
	reMDHeading = regexp.MustCompile(`(?m)^#{1,3} +(.+)$`)
	// Bold: **text** or __text__
	reMDBold = regexp.MustCompile(`\*\*([^*\n]+)\*\*|__([^_\n]+)__`)
	// Strikethrough: ~~text~~
	reMDStrike = regexp.MustCompile(`~~([^~\n]+)~~`)
	// Italic: *text* or _text_ (applied after bold to avoid consuming **)
	reMDItalic = regexp.MustCompile(`\*([^*\n]+)\*|_([^_\n\s][^_\n]*[^_\n\s]|[^_\n\s])_`)
	// Unordered bullet list items
	reMDBullet = regexp.MustCompile(`(?m)^[ \t]*[-*+] +`)
	// Horizontal rules (---, ***, ___)
	reMDHRule = regexp.MustCompile(`(?m)^[-*_]{3,}\s*$`)
	// Collapse 3+ consecutive blank lines to 2
	reMDExcessNL = regexp.MustCompile(`\n{3,}`)
)

// markdownToTelegramHTML converts a Markdown-formatted string to the HTML subset
// accepted by Telegram Bot API's ParseMode="HTML".
//
// Supported conversions:
//   - Fenced code blocks  (``` … ```) → <pre><code>…</code></pre>
//   - Inline code         (`…`)        → <code>…</code>
//   - Bold                (**…**)      → <b>…</b>
//   - Italic              (*…*)        → <i>…</i>
//   - Strikethrough       (~~…~~)      → <s>…</s>
//   - Headings            (# / ## / ###) → <b>…</b>
//   - Unordered lists     (- / * / +)  → • bullet
//   - Horizontal rules    (---)        → ───────────────
//   - Markdown links      ([text](url)) → <a href="url">text</a>
//   - Raw URLs are left as-is; Telegram auto-links them.
//
// All non-code content is HTML-escaped before pattern substitution, so literal
// '<', '>', and '&' in the LLM response cannot break Telegram's HTML parser.
func markdownToTelegramHTML(md string) string {
	// We protect code blocks and inline code (and links) with NUL-delimited
	// placeholders before HTML-escaping so their content is preserved verbatim.
	var saved []string
	save := func(htmlFrag string) string {
		idx := len(saved)
		saved = append(saved, htmlFrag)
		return fmt.Sprintf("\x00%d\x00", idx)
	}

	// 1. Protect fenced code blocks first (highest priority).
	md = reMDFencedCode.ReplaceAllStringFunc(md, func(m string) string {
		sub := reMDFencedCode.FindStringSubmatch(m)
		content := strings.TrimRight(sub[1], "\n")
		return save("<pre><code>" + html.EscapeString(content) + "</code></pre>")
	})

	// 2. Protect inline code.
	md = reMDInlineCode.ReplaceAllStringFunc(md, func(m string) string {
		sub := reMDInlineCode.FindStringSubmatch(m)
		return save("<code>" + html.EscapeString(sub[1]) + "</code>")
	})

	// 3. Protect markdown links before HTML-escaping (URL must not be escaped).
	md = reMDLink.ReplaceAllStringFunc(md, func(m string) string {
		sub := reMDLink.FindStringSubmatch(m)
		return save(fmt.Sprintf(`<a href="%s">%s</a>`, sub[2], html.EscapeString(sub[1])))
	})

	// 4. HTML-escape everything that remains.
	//    The NUL-delimited placeholders use only digits and \x00, none of which
	//    are HTML special characters, so they survive EscapeString intact.
	md = html.EscapeString(md)

	// 5. Headings → bold line  (patterns safe because # is not an HTML char)
	md = reMDHeading.ReplaceAllString(md, "<b>$1</b>")

	// 6. Bold (**text** or __text__)
	md = reMDBold.ReplaceAllStringFunc(md, func(m string) string {
		sub := reMDBold.FindStringSubmatch(m)
		inner := sub[1]
		if inner == "" {
			inner = sub[2]
		}
		return "<b>" + inner + "</b>"
	})

	// 7. Strikethrough (~~text~~) — before italic to avoid eating tildes
	md = reMDStrike.ReplaceAllString(md, "<s>$1</s>")

	// 8. Italic (*text* or _text_) — applied after bold so ** isn't misread
	md = reMDItalic.ReplaceAllStringFunc(md, func(m string) string {
		sub := reMDItalic.FindStringSubmatch(m)
		inner := sub[1]
		if inner == "" {
			inner = sub[2]
		}
		return "<i>" + inner + "</i>"
	})

	// 9. Unordered bullet list markers → bullet character
	md = reMDBullet.ReplaceAllString(md, "• ")

	// 10. Horizontal rules → visual separator
	md = reMDHRule.ReplaceAllString(md, "───────────────")

	// 11. Collapse excessive blank lines
	md = reMDExcessNL.ReplaceAllString(md, "\n\n")

	// 12. Restore saved placeholders.
	for i, frag := range saved {
		md = strings.ReplaceAll(md, fmt.Sprintf("\x00%d\x00", i), frag)
	}

	return strings.TrimSpace(md)
}
