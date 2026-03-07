// Package cli provides the StarPion command-line interface.
package cli

import (
	"os"

	"github.com/charmbracelet/lipgloss"
	"golang.org/x/term"
)

// ── Color palette: "Antares Night" ───────────────────────────────────────────
// Inspired by Scorpius constellation and its heart star Antares.
const (
	colorGold    = "#FFD700" // star light, title
	colorAntares = "#FF4500" // Antares red-orange, stinger / accent
	colorCrimson = "#C41E3A" // scorpion body, claws
	colorIndigo  = "#4B0082" // deep space, borders
	colorStar    = "#E8E8FF" // star white, normal text
	colorNebula  = "#888AAA" // dim text, hints
	colorSuccess = "#00C853" // check marks
	colorError   = "#FF1744" // errors
	colorWarning = "#FF8F00" // warnings
)

var (
	sGold    = lipgloss.NewStyle().Foreground(lipgloss.Color(colorGold)).Bold(true)
	sAntares = lipgloss.NewStyle().Foreground(lipgloss.Color(colorAntares))
	sCrimson = lipgloss.NewStyle().Foreground(lipgloss.Color(colorCrimson))
	sIndigo  = lipgloss.NewStyle().Foreground(lipgloss.Color(colorIndigo))
	sStar    = lipgloss.NewStyle().Foreground(lipgloss.Color(colorStar))
	sNebula  = lipgloss.NewStyle().Foreground(lipgloss.Color(colorNebula))
	sSuccess = lipgloss.NewStyle().Foreground(lipgloss.Color(colorSuccess)).Bold(true)
	sError   = lipgloss.NewStyle().Foreground(lipgloss.Color(colorError)).Bold(true)
	sWarning = lipgloss.NewStyle().Foreground(lipgloss.Color(colorWarning))
	sBold    = lipgloss.NewStyle().Bold(true)
)

// termWidth returns the current terminal column count, clamped to [40, 120].
func termWidth() int {
	w, _, err := term.GetSize(int(os.Stdout.Fd()))
	if err != nil || w < 40 {
		return 80
	}
	if w > 120 {
		return 120
	}
	return w
}
