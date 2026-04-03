package cli

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// STARNION block-letter title (S-T-A-R-N-I-O-N, Unicode box-drawing).
var titleLines = []string{
	`███████╗████████╗ █████╗ ██████╗ ███╗   ██╗██╗ ██████╗ ███╗   ██╗`,
	`██╔════╝╚══██╔══╝██╔══██╗██╔══██╗████╗  ██║██║██╔═══██╗████╗  ██║`,
	`███████╗   ██║   ███████║██████╔╝██╔██╗ ██║██║██║   ██║██╔██╗ ██║`,
	`╚════██║   ██║   ██╔══██║██╔══██╗██║╚██╗██║██║██║   ██║██║╚██╗██║`,
	`███████║   ██║   ██║  ██║██║  ██║██║ ╚████║██║╚██████╔╝██║ ╚████║`,
	`╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝`,
}

// PrintBanner prints the full StarNion startup banner.
func PrintBanner(ver string) {
	tw := termWidth()

	titleWidth := lipgloss.Width(titleLines[0])
	if tw >= titleWidth+4 {
		titlePad := clampMin((tw-titleWidth)/2, 0)
		padStr := strings.Repeat(" ", titlePad)

		const iCenterOffset = 44
		fmt.Println(strings.Repeat(" ", titlePad+iCenterOffset) + sGold.Render("✦"))

		for _, l := range titleLines {
			fmt.Println(padStr + sGold.Render(l))
		}
	} else {
		fmt.Println(sGold.Render("  S T A R N I O N"))
	}

	taglineText := fmt.Sprintf("Personal AI Assistant  •  v%s", ver)
	fmt.Println(centreInWidth(sNebula.Render(taglineText), tw))
	fmt.Println()
}

// PrintSectionHeader prints a full-width section divider with step counter.
func PrintSectionHeader(n, total int, title string) {
	tw := termWidth()

	dashLine := " " + sIndigo.Render(strings.Repeat("─", tw-2))

	var label string
	if total > 0 {
		label = fmt.Sprintf("  [%d/%d]  %s", n, total, title)
	} else {
		label = fmt.Sprintf("  %s", title)
	}
	icon := sGold.Render("✦")

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
	side := clampMin((tw-lw-4)/2, 1)
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
	pad := clampMin((width-sw)/2, 0)
	return strings.Repeat(" ", pad) + s
}

func clampMin(a, b int) int {
	if a > b {
		return a
	}
	return b
}
