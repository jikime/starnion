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


// PrintBanner prints the full StarNion startup banner:
//
//	            ✦           ← star above the "I" in STARNION
//	  STARNION block title  (centred)
//	  Personal AI Assistant •  vX.X.X  (centred)
func PrintBanner(version string) {
	tw := termWidth()

	titleWidth := lipgloss.Width(titleLines[0])
	if tw >= titleWidth+4 {
		titlePad := max((tw-titleWidth)/2, 0)
		padStr := strings.Repeat(" ", titlePad)

		// ── Star above the "I" in STARNION ───────────────────────────────────
		// STARN prefix visual width = 43  (S:8 + T:9 + sp:1 + A:6 + sp:1 + R:7 + sp:1 + N:10)
		// I block width = 3  →  I centre offset from title start = 43 + 1 = 44
		const iCenterOffset = 44
		fmt.Println(strings.Repeat(" ", titlePad+iCenterOffset) + sGold.Render("✦"))

		// ── Title (gold block letters, centred) ───────────────────────────────
		for _, l := range titleLines {
			fmt.Println(padStr + sGold.Render(l))
		}
	} else {
		// terminal too narrow — plain text fallback
		fmt.Println(sGold.Render("  S T A R N I O N"))
	}

	// ── Tagline (centred on terminal) ────────────────────────────────────────
	taglineText := fmt.Sprintf("Personal AI Assistant  •  v%s", version)
	fmt.Println(centreInWidth(sNebula.Render(taglineText), tw))
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
