package telegram

// Gateway is a stateless facade over per-token Client instances that
// satisfies the channels usecase's TelegramGateway port. The usecase
// calls it with a bot token each time, so this file does not hold
// state — it constructs a fresh Client per call like the legacy
// handler did.
type Gateway struct{}

// NewGateway returns a ready-to-use facade.
func NewGateway() *Gateway { return &Gateway{} }

// SetWebhook registers the given webhook URL for the bot token.
// secretToken is forwarded to Telegram so it can send the
// X-Telegram-Bot-Api-Secret-Token header on every delivery.
func (g *Gateway) SetWebhook(token, webhookURL, secretToken string) error {
	return NewClient(token).SetWebhook(webhookURL, secretToken)
}

// GetBotUsername returns the bot's @username via getMe.
func (g *Gateway) GetBotUsername(token string) (string, error) {
	return NewClient(token).GetMe()
}
