package handler

import (
	"context"
	"strings"

	"github.com/newstarnion/gateway/internal/infrastructure/telegram"
)

// CommandDef is a single bot command definition.
// Adding a new command: append one entry here — help text is auto-generated.
type CommandDef struct {
	// Name is the slash-command name without the leading "/".
	Name string
	// ArgHint is optional argument description shown in /help (e.g. "[number|name]").
	ArgHint string
	// Description is the one-line help text shown in /help.
	Description string
	// Handler is called when the command is matched.
	// arg is the trimmed text after the command name (empty string if none).
	Handler func(ctx context.Context, h *TelegramHandler, info *userBotInfo, tg *telegram.Client, chatID int64, firstName, username, arg string)
}

// CommandRegistry is the single source of truth for all Telegram bot commands.
// Order determines the /help listing order.
// Populated in init() to avoid package-level init cycle with BuildHelpText.
var CommandRegistry []CommandDef

func init() {
	CommandRegistry = []CommandDef{
		{
			Name:        "start",
			Description: "Link this account with the Starnion web app",
			Handler: func(ctx context.Context, h *TelegramHandler, info *userBotInfo, tg *telegram.Client, chatID int64, _, _ string, _ string) {
				h.handleStartCommand(ctx, info, chatID)
			},
		},
		{
			Name:        "help",
			Description: "Show this help message",
			Handler: func(_ context.Context, _ *TelegramHandler, _ *userBotInfo, tg *telegram.Client, chatID int64, _, _ string, _ string) {
				tg.SendMessage(chatID, BuildHelpText())
			},
		},
		{
			Name:        "persona",
			ArgHint:     "[number|name]",
			Description: "List or switch AI personas",
			Handler: func(ctx context.Context, h *TelegramHandler, info *userBotInfo, _ *telegram.Client, chatID int64, _, _ string, arg string) {
				h.handlePersonaCommand(ctx, info, chatID, arg)
			},
		},
		{
			Name:        "new",
			Description: "Start a new conversation",
			Handler: func(ctx context.Context, h *TelegramHandler, info *userBotInfo, tg *telegram.Client, chatID int64, firstName, username string, _ string) {
				h.handleNewCommand(ctx, info, tg, chatID, firstName, username)
			},
		},
		{
			Name:        "status",
			Description: "Show current persona and model",
			Handler: func(ctx context.Context, h *TelegramHandler, info *userBotInfo, tg *telegram.Client, chatID int64, _, _ string, _ string) {
				h.handleStatusCommand(ctx, info, tg, chatID)
			},
		},
	}
}

// BuildHelpText generates the /help message from CommandRegistry automatically.
func BuildHelpText() string {
	var sb strings.Builder
	sb.WriteString("📖 *Available Commands*\n\n")
	for _, cmd := range CommandRegistry {
		sb.WriteString("/")
		sb.WriteString(cmd.Name)
		if cmd.ArgHint != "" {
			sb.WriteString(" ")
			sb.WriteString(cmd.ArgHint)
		}
		sb.WriteString(" — ")
		sb.WriteString(cmd.Description)
		sb.WriteString("\n")
	}
	return sb.String()
}

// DispatchCommand checks text against CommandRegistry and calls the matching handler.
// Returns true if a command was matched and handled.
func DispatchCommand(
	ctx context.Context,
	h *TelegramHandler,
	info *userBotInfo,
	tg *telegram.Client,
	chatID int64,
	firstName, username, text string,
) bool {
	if !strings.HasPrefix(text, "/") {
		return false
	}
	for _, cmd := range CommandRegistry {
		prefix := "/" + cmd.Name
		if rest, ok := strings.CutPrefix(text, prefix); ok {
			// Ensure it's an exact match or followed by space/newline (not a prefix of another command)
			if rest == "" || rest[0] == ' ' || rest[0] == '\n' || rest[0] == '\r' {
				arg := strings.TrimSpace(rest)
				cmd.Handler(ctx, h, info, tg, chatID, firstName, username, arg)
				return true
			}
		}
	}
	return false
}
