package cli

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// STARPION block-letter title (Unicode box-drawing, one column per char).
var titleLines = []string{
	`███████╗████████╗ █████╗ ██████╗ ██████╗ ██╗ ██████╗ ███╗   ██╗`,
	`██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██║██╔═══██╗████╗  ██║`,
	`███████╗   ██║   ███████║██████╔╝██████╔╝██║██║   ██║██╔██╗ ██║`,
	`╚════██║   ██║   ██╔══██║██╔══██╗██╔═══╝ ██║██║   ██║██║╚██╗██║`,
	`███████║   ██║   ██║  ██║██║  ██║██║     ██║╚██████╔╝██║ ╚████║`,
	`╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝`,
}

// scorpionRaw is the top-down ASCII art of a scorpion.
// Lines need not be equal length — padLines() normalises them.
const scorpionRaw = `
       /\           /\
  ____/  \_________/  \____
 ( >>   \___________/   << )
  \    /             \    /
   \  /  (o)     (o)  \  /
    \/     \_____/     \/
    /\       | |       /\
   /  \      | |      /  \
  / /\ \_____|_|_____/ /\ \
 / /  \               /  \ \
/_/    \             /    \_\
        \___________/
              | |
              | |
             / \
            /   \
           / ~~~ \
          / ~~~~~ \
         *    V    *`

// padLines splits raw ASCII art by newlines, removes leading blank lines,
// measures the true visual width of each line (via lipgloss.Width which
// uses go-runewidth internally), and pads every line with trailing spaces
// so they are all exactly the same visual width.
// This guarantees that any lipgloss border wrapping the result stays intact.
func padLines(raw string) []string {
	all := strings.Split(raw, "\n")

	// strip leading/trailing blank lines
	start, end := 0, len(all)-1
	for start <= end && strings.TrimSpace(all[start]) == "" {
		start++
	}
	for end >= start && strings.TrimSpace(all[end]) == "" {
		end--
	}
	lines := all[start : end+1]

	// find maximum visual width
	maxW := 0
	for _, l := range lines {
		if w := lipgloss.Width(l); w > maxW {
			maxW = w
		}
	}

	// pad each line to maxW
	result := make([]string, len(lines))
	for i, l := range lines {
		pad := maxW - lipgloss.Width(l)
		if pad < 0 {
			pad = 0
		}
		result[i] = l + strings.Repeat(" ", pad)
	}
	return result
}

// colorScorpion applies the Antares Night palette to the padded scorpion lines.
// Claws and body: crimson → antares gradient toward the tail.
func colorScorpion(lines []string) []string {
	total := len(lines)
	colored := make([]string, total)
	for i, l := range lines {
		ratio := float64(i) / float64(total)
		switch {
		case ratio < 0.3:
			colored[i] = sCrimson.Render(l)
		case ratio < 0.7:
			// mid-body mix
			colored[i] = sAntares.Render(l)
		default:
			// tail → stinger: bright antares / gold tip
			if i == total-1 {
				colored[i] = sGold.Render(l)
			} else {
				colored[i] = sAntares.Render(l)
			}
		}
	}
	return colored
}

// bannerBox wraps content in a double-border box sized exactly to content width.
// Because we padded all content lines first, lipgloss sees consistent widths
// and draws the border without gaps or overflows.
func bannerBox(content string) string {
	return lipgloss.NewStyle().
		Border(lipgloss.DoubleBorder()).
		BorderForeground(lipgloss.Color(colorIndigo)).
		Padding(0, 2).
		Render(content)
}

// PrintBanner prints the full StarPion startup banner:
//
//	[ STARPION block title  ]
//	[ double-border box:    ]
//	[   scorpion ASCII art  ]
//	[   version & tagline   ]
func PrintBanner(version string) {
	tw := termWidth()

	// ── Title (gold block letters, outside the box) ───────────────────────────
	titleWidth := lipgloss.Width(titleLines[0])
	if tw >= titleWidth+4 {
		// centre-align: pad left by (tw - titleWidth) / 2
		pad := strings.Repeat(" ", max((tw-titleWidth)/2, 0))
		for _, l := range titleLines {
			fmt.Println(pad + sGold.Render(l))
		}
	} else {
		// terminal too narrow — plain text fallback
		fmt.Println(sGold.Render("  S T A R P I O N"))
	}

	// ── Scorpion + tagline inside bordered box ────────────────────────────────
	scorpionPadded := padLines(scorpionRaw)
	scorpionColored := colorScorpion(scorpionPadded)
	scorpionStr := strings.Join(scorpionColored, "\n")

	innerWidth := lipgloss.Width(scorpionPadded[0])

	// tagline centred to match scorpion width
	taglineText := fmt.Sprintf("Personal AI Assistant  •  v%s", version)
	tagPad := max((innerWidth-lipgloss.Width(taglineText))/2, 0)
	tagline := strings.Repeat(" ", tagPad) + sNebula.Render(taglineText)

	starLine := centreInWidth(sGold.Render("✦ ✦ ✦"), innerWidth)

	boxContent := scorpionStr + "\n\n" + starLine + "\n" + tagline

	box := bannerBox(boxContent)

	// centre the box on the terminal
	boxW := lipgloss.Width(box)
	boxPad := strings.Repeat(" ", max((tw-boxW)/2, 0))
	for _, l := range strings.Split(box, "\n") {
		fmt.Println(boxPad + l)
	}
	fmt.Println()
}

// PrintSectionHeader prints a full-width section divider with step counter.
//
//	 ─────────────────────────────────────────────────────
//	  [2/5]  DATABASE SETUP                          ✦
//	 ─────────────────────────────────────────────────────
func PrintSectionHeader(n, total int, title string) {
	tw := termWidth()

	// inner line (tw-2 dashes, leave 1 space margin each side)
	dashLine := " " + sIndigo.Render(strings.Repeat("─", tw-2))

	label := fmt.Sprintf("  [%d/%d]  %s", n, total, title)
	icon := sGold.Render("✦")

	// fill space between label and icon
	labelW := lipgloss.Width(label)
	iconW := lipgloss.Width(icon)
	gap := tw - labelW - iconW - 1
	if gap < 1 {
		gap = 1
	}

	headerLine := sBold.Render(sStar.Render(label)) +
		strings.Repeat(" ", gap) + icon

	fmt.Println()
	fmt.Println(dashLine)
	fmt.Println(headerLine)
	fmt.Println(dashLine)
	fmt.Println()
}

// PrintInlineHeader prints a lighter single-line divider for sub-sections.
func PrintInlineHeader(label string) {
	tw := termWidth()
	lw := lipgloss.Width(label)
	side := max((tw-lw-4)/2, 1)
	line := sNebula.Render(strings.Repeat("·", side))
	fmt.Println(line + "  " + sGold.Render(label) + "  " + line)
}

// ── Status helpers ────────────────────────────────────────────────────────────

func PrintOK(label, msg string) {
	fmt.Printf("  %s  %-20s %s\n", sSuccess.Render("✓"), sBold.Render(label), sStar.Render(msg))
}

func PrintFail(label, msg string) {
	fmt.Printf("  %s  %-20s %s\n", sError.Render("✗"), sBold.Render(label), sError.Render(msg))
}

func PrintWarn(label, msg string) {
	fmt.Printf("  %s  %-20s %s\n", sWarning.Render("!"), sBold.Render(label), sWarning.Render(msg))
}

func PrintInfo(msg string) {
	fmt.Printf("  %s  %s\n", sIndigo.Render("·"), sNebula.Render(msg))
}

func PrintHint(msg string) {
	fmt.Printf("\n  %s\n\n", sNebula.Render(msg))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func centreInWidth(s string, width int) string {
	sw := lipgloss.Width(s)
	pad := max((width-sw)/2, 0)
	return strings.Repeat(" ", pad) + s
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
