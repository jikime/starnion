package cli

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

// ── Internal BubbleTea message types ─────────────────────────────────────────

type chatStreamStarted struct{}
type chatStreamChunk struct{ text string }
type chatStreamDone struct{ promptTokens, completionTokens int }
type chatStreamErr struct{ msg string }

// ── Chat entry (one conversational turn) ─────────────────────────────────────

type chatEntry struct {
	role    string // "user" | "assistant"
	content string
	pending bool // still streaming
}

// ── BubbleTea model ───────────────────────────────────────────────────────────

type chatTUIModel struct {
	viewport   viewport.Model
	textarea   textarea.Model
	entries    []chatEntry
	streaming  bool
	threadID   string
	gatewayURL string
	token      string
	userEmail  string
	width      int
	height     int
	ready      bool
	streamCh   chan tea.Msg
	statusLine string
}

// ── Styles ────────────────────────────────────────────────────────────────────

var (
	styleChatUserLabel = lipgloss.NewStyle().Foreground(lipgloss.Color(colorGold)).Bold(true)
	styleChatUserText  = lipgloss.NewStyle().Foreground(lipgloss.Color(colorGold))
	styleChatAILabel   = lipgloss.NewStyle().Foreground(lipgloss.Color(colorNebula)).Bold(true)
	styleChatAIText    = lipgloss.NewStyle().Foreground(lipgloss.Color(colorStar))
	styleChatDivLine   = lipgloss.NewStyle().Foreground(lipgloss.Color(colorIndigo))
	styleChatHintLine  = lipgloss.NewStyle().Foreground(lipgloss.Color(colorNebula))
)

// chatLayoutFixed is the number of fixed lines in the TUI layout:
// header title(1) + divider(1) + divider(1) + input border top(1) +
// input text(1) + input border bottom(1) + hints(1) = 7
const chatLayoutFixed = 7

// ── Constructor ───────────────────────────────────────────────────────────────

func newChatTUIModel(gatewayURL, token, email string) chatTUIModel {
	ta := textarea.New()
	ta.Placeholder = "메시지를 입력하세요... (Enter: 전송, /clear: 초기화)"
	ta.CharLimit = 4000
	ta.SetHeight(1)
	ta.ShowLineNumbers = false
	ta.KeyMap.InsertNewline.SetEnabled(false) // Enter = submit, not newline
	ta.Focus()

	return chatTUIModel{
		textarea:   ta,
		gatewayURL: gatewayURL,
		token:      token,
		userEmail:  email,
		streamCh:   make(chan tea.Msg, 128),
		threadID:   randomSecret(8), // 16-char hex as thread ID
	}
}

// ── BubbleTea interface ───────────────────────────────────────────────────────

func (m chatTUIModel) Init() tea.Cmd {
	return textarea.Blink
}

func (m chatTUIModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m = m.recalcLayout()

	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC:
			return m, tea.Quit

		case tea.KeyEnter:
			if m.streaming {
				break
			}
			text := strings.TrimSpace(m.textarea.Value())
			if text == "" {
				break
			}
			if text == "/clear" {
				m.entries = nil
				m.threadID = randomSecret(8)
				m.statusLine = "새로운 대화를 시작합니다."
				m.textarea.Reset()
				m.syncViewport()
				break
			}
			return m.submitMessage(text)

		default:
			var taCmd tea.Cmd
			m.textarea, taCmd = m.textarea.Update(msg)
			cmds = append(cmds, taCmd)
		}

	case chatStreamStarted:
		cmds = append(cmds, m.waitForStreamCmd())

	case chatStreamChunk:
		n := len(m.entries)
		if n > 0 && m.entries[n-1].role == "assistant" {
			m.entries[n-1].content += msg.text
		} else {
			m.entries = append(m.entries, chatEntry{role: "assistant", content: msg.text, pending: true})
		}
		m.syncViewport()
		cmds = append(cmds, m.waitForStreamCmd())

	case chatStreamDone:
		n := len(m.entries)
		if n > 0 && m.entries[n-1].role == "assistant" {
			m.entries[n-1].pending = false
		}
		m.streaming = false
		if msg.promptTokens > 0 || msg.completionTokens > 0 {
			m.statusLine = fmt.Sprintf("↑ %d  ↓ %d tokens", msg.promptTokens, msg.completionTokens)
		} else {
			m.statusLine = ""
		}
		m.syncViewport()
		cmds = append(cmds, textarea.Blink)

	case chatStreamErr:
		n := len(m.entries)
		errText := sError.Render("오류: " + msg.msg)
		if n > 0 && m.entries[n-1].role == "assistant" && m.entries[n-1].pending {
			m.entries[n-1].content += "\n" + errText
			m.entries[n-1].pending = false
		} else {
			m.entries = append(m.entries, chatEntry{role: "assistant", content: errText})
		}
		m.streaming = false
		m.statusLine = ""
		m.syncViewport()
		cmds = append(cmds, textarea.Blink)

	default:
		var vpCmd tea.Cmd
		m.viewport, vpCmd = m.viewport.Update(msg)
		cmds = append(cmds, vpCmd)
	}

	return m, tea.Batch(cmds...)
}

// recalcLayout resets viewport size and textarea width based on terminal size.
func (m chatTUIModel) recalcLayout() chatTUIModel {
	vpH := clampMin(m.height-chatLayoutFixed, 3)
	vpW := m.width

	if !m.ready {
		m.viewport = viewport.New(vpW, vpH)
		m.ready = true
	} else {
		m.viewport.Width = vpW
		m.viewport.Height = vpH
	}
	// Textarea width: inside rounded border (2 chars) with 2 chars padding = -4;
	// additional 2 for safety = -6 total.
	m.textarea.SetWidth(clampMin(m.width-6, 10))
	m.syncViewport()
	return m
}

// syncViewport rebuilds viewport content and scrolls to bottom.
func (m *chatTUIModel) syncViewport() {
	m.viewport.SetContent(m.renderMessages())
	m.viewport.GotoBottom()
}

// View renders the complete TUI frame.
func (m chatTUIModel) View() string {
	if !m.ready {
		return "\n  로딩 중...\n"
	}

	tw := m.width
	div := styleChatDivLine.Render(strings.Repeat("─", tw))

	// Header line
	header := fmt.Sprintf("  %s  %s", sGold.Render("★"), sBold.Render("StarNion Chat"))
	if m.userEmail != "" {
		header += styleChatHintLine.Render("  ·  " + m.userEmail)
	}

	// Hints / status line
	var hints string
	if m.streaming {
		hints = sNebula.Render("  ● 응답 중...") +
			styleChatHintLine.Render("                        /clear: 초기화  ·  Ctrl+C: 종료")
	} else {
		h := "  Enter: 전송  ·  /clear: 초기화  ·  Ctrl+C: 종료"
		if m.statusLine != "" {
			h += "   " + m.statusLine
		}
		hints = styleChatHintLine.Render(h)
	}

	// Input box with rounded border; border turns gold when idle
	borderColor := lipgloss.Color(colorIndigo)
	if !m.streaming {
		borderColor = lipgloss.Color(colorGold)
	}
	inputBox := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderColor).
		Width(tw - 2).
		Render(m.textarea.View())

	return header + "\n" +
		div + "\n" +
		m.viewport.View() + "\n" +
		div + "\n" +
		inputBox + "\n" +
		hints
}

// ── Message submission & streaming ───────────────────────────────────────────

func (m chatTUIModel) submitMessage(text string) (tea.Model, tea.Cmd) {
	m.entries = append(m.entries, chatEntry{role: "user", content: text})
	m.streaming = true
	m.statusLine = ""
	m.textarea.Reset()
	m.syncViewport()
	return m, m.startStreamCmd(text)
}

// startStreamCmd returns a Cmd that launches the SSE goroutine and signals start.
func (m chatTUIModel) startStreamCmd(text string) tea.Cmd {
	ch := m.streamCh
	gatewayURL := m.gatewayURL
	token := m.token
	threadID := m.threadID
	return func() tea.Msg {
		go streamChatSSE(ch, gatewayURL, token, threadID, text)
		return chatStreamStarted{}
	}
}

// waitForStreamCmd returns a Cmd that reads the next event from the stream channel.
func (m chatTUIModel) waitForStreamCmd() tea.Cmd {
	ch := m.streamCh
	return func() tea.Msg { return <-ch }
}

// streamChatSSE does the HTTP POST and reads AI SDK v6 SSE events into ch.
//
// Wire format (per gateway/internal/adapter/handler/stream.go):
//
//	data: CODE:JSON_VALUE\n\n
//	  "0"  → text delta (JSON string)
//	  "e"  → step end  (JSON object, contains usage)
//	  "d"  → stream done (JSON object)
//	  "3"  → error (JSON string)
func streamChatSSE(ch chan<- tea.Msg, gatewayURL, token, threadID, message string) {
	body, _ := json.Marshal(map[string]string{
		"message":   message,
		"thread_id": threadID,
	})

	req, err := http.NewRequest(http.MethodPost, gatewayURL+"/api/v1/chat/stream", bytes.NewReader(body))
	if err != nil {
		ch <- chatStreamErr{msg: err.Error()}
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := new(http.Client).Do(req) // Timeout=0 — no deadline on streaming
	if err != nil {
		ch <- chatStreamErr{msg: "연결 실패: " + err.Error()}
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		ch <- chatStreamErr{msg: fmt.Sprintf("서버 오류 (HTTP %d)", resp.StatusCode)}
		return
	}

	var promptTokens, completionTokens int
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "" {
			continue
		}

		// Split CODE:JSON_VALUE on the first colon.
		code, raw, ok := strings.Cut(data, ":")
		if !ok {
			continue
		}

		switch code {
		case "0": // text delta
			var t string
			if json.Unmarshal([]byte(raw), &t) == nil && t != "" {
				ch <- chatStreamChunk{text: t}
			}

		case "e": // step end — harvest token counts
			var ev map[string]any
			if json.Unmarshal([]byte(raw), &ev) == nil {
				if u, ok := ev["usage"].(map[string]any); ok {
					if v, ok := u["promptTokens"].(float64); ok {
						promptTokens = int(v)
					}
					if v, ok := u["completionTokens"].(float64); ok {
						completionTokens = int(v)
					}
				}
			}

		case "d": // stream done
			ch <- chatStreamDone{promptTokens: promptTokens, completionTokens: completionTokens}
			return

		case "3": // error
			var errMsg string
			if json.Unmarshal([]byte(raw), &errMsg) == nil {
				ch <- chatStreamErr{msg: errMsg}
			} else {
				ch <- chatStreamErr{msg: raw}
			}
			return
		}
	}

	if err := scanner.Err(); err != nil {
		ch <- chatStreamErr{msg: "스트림 읽기 오류: " + err.Error()}
		return
	}
	// EOF without explicit "d" — treat as done
	ch <- chatStreamDone{promptTokens: promptTokens, completionTokens: completionTokens}
}

// ── Message rendering ─────────────────────────────────────────────────────────

// renderMessages builds the full viewport content string from m.entries.
func (m chatTUIModel) renderMessages() string {
	if len(m.entries) == 0 {
		hint := centreInWidth(sNebula.Render("안녕하세요! 무엇이든 물어보세요."), clampMin(m.viewport.Width, 40))
		return "\n\n" + hint + "\n"
	}

	vw := clampMin(m.viewport.Width, 20)
	var sb strings.Builder
	sb.WriteString("\n")

	for i, e := range m.entries {
		if i > 0 {
			sb.WriteString("\n")
		}
		if e.role == "user" {
			sb.WriteString(rightAlign(styleChatUserLabel.Render("You"), vw) + "\n")
			for _, line := range chatWrapText(e.content, vw-4) {
				sb.WriteString(rightAlign(styleChatUserText.Render(line), vw) + "\n")
			}
		} else {
			sb.WriteString(styleChatAILabel.Render("★ StarNion") + "\n")
			content := e.content
			if e.pending {
				content += "▌"
			}
			for _, line := range chatWrapText(content, vw-4) {
				sb.WriteString(styleChatAIText.Render("  "+line) + "\n")
			}
		}
	}
	sb.WriteString("\n")
	return sb.String()
}

// rightAlign pads s on the left so its visual width equals width.
func rightAlign(s string, width int) string {
	if pad := width - lipgloss.Width(s); pad > 0 {
		return strings.Repeat(" ", pad) + s
	}
	return s
}

// chatWrapText wraps text to maxWidth, using lipgloss.Width for CJK safety.
func chatWrapText(text string, maxWidth int) []string {
	if maxWidth <= 0 {
		return []string{text}
	}
	var result []string
	for _, para := range strings.Split(text, "\n") {
		if lipgloss.Width(para) <= maxWidth {
			result = append(result, para)
			continue
		}
		words := strings.Fields(para)
		if len(words) == 0 {
			result = append(result, "")
			continue
		}
		line := words[0]
		for _, word := range words[1:] {
			if lipgloss.Width(line+" "+word) <= maxWidth {
				line += " " + word
			} else {
				result = append(result, line)
				line = word
			}
		}
		if line != "" {
			result = append(result, line)
		}
	}
	return result
}

// ── cobra command ─────────────────────────────────────────────────────────────

func newChatCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "chat",
		Short: "AI와 대화하기 (터미널 TUI 채팅)",
		Long: "StarNion AI와 터미널 채팅 인터페이스로 대화합니다.\n" +
			"로그인 후 사용 가능합니다 ('starnion login').\n\n" +
			"  Enter      메시지 전송\n" +
			"  /clear     대화 초기화 (새 스레드 시작)\n" +
			"  Ctrl+C     종료",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runChat()
		},
	}
}

func runChat() error {
	gatewayURL, token, _, err := ResolveCLICredentials()
	if err != nil {
		return err
	}

	cfg, _ := LoadUserConfig()

	m := newChatTUIModel(gatewayURL, token, cfg.Email)
	p := tea.NewProgram(m, tea.WithAltScreen(), tea.WithMouseCellMotion())
	_, err = p.Run()
	return err
}
