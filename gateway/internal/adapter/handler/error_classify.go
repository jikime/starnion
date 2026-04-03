package handler

import (
	"regexp"
	"strings"
)

// agentErrorCategory classifies error messages from the AI agent.
type agentErrorCategory string

const (
	errCatAuth    agentErrorCategory = "auth"
	errCatNoKey   agentErrorCategory = "no_key"
	errCatUnknown agentErrorCategory = ""
)

var authErrorPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)authentication failed`),
	regexp.MustCompile(`(?i)invalid.*api[_\s]?key`),
	regexp.MustCompile(`(?i)api[_\s]?key.*invalid`),
	regexp.MustCompile(`(?i)invalid bearer token`),
	regexp.MustCompile(`(?i)\bunauthorized\b`),
	regexp.MustCompile(`(?i)credentials.*expired`),
}

var noKeyPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)no api key found`),
	regexp.MustCompile(`(?i)missing.*api[_\s]?key`),
}

func classifyAgentError(msg string) agentErrorCategory {
	for _, re := range noKeyPatterns {
		if re.MatchString(msg) {
			return errCatNoKey
		}
	}
	for _, re := range authErrorPatterns {
		if re.MatchString(msg) {
			return errCatAuth
		}
	}
	return errCatUnknown
}

// friendlyErrorMessage returns a user-facing message for the given error
// category and language code (e.g. "ko", "en", "ja", "zh").
// Returns empty string for unknown categories (caller should use the raw message).
func friendlyErrorMessage(cat agentErrorCategory, lang string) string {
	switch cat {
	case errCatNoKey:
		switch {
		case strings.HasPrefix(lang, "ko"):
			return "⚠️ AI API 키가 설정되지 않았습니다.\n\n" +
				"서버 관리자에게 아래 설정을 요청하세요:\n" +
				"1. 서버에서 claude 실행 → /login 명령으로 인증 (Claude Code 구독)\n" +
				"2. 또는 Settings → Models 에서 API 키 등록"
		case strings.HasPrefix(lang, "ja"):
			return "⚠️ AI APIキーが設定されていません。\n\n" +
				"サーバー管理者に以下の設定を依頼してください:\n" +
				"1. サーバーで claude を実行 → /login コマンドで認証\n" +
				"2. または Settings → Models でAPIキーを登録"
		case strings.HasPrefix(lang, "zh"):
			return "⚠️ AI API密钥未设置。\n\n" +
				"请联系服务器管理员进行以下设置:\n" +
				"1. 在服务器上运行 claude → 使用 /login 命令认证\n" +
				"2. 或在 Settings → Models 中注册API密钥"
		default:
			return "⚠️ AI API key is not configured.\n\n" +
				"Please ask your server administrator to:\n" +
				"1. Run `claude` on the server → use /login to authenticate\n" +
				"2. Or register an API key in Settings → Models"
		}
	case errCatAuth:
		switch {
		case strings.HasPrefix(lang, "ko"):
			return "⚠️ AI 인증이 만료되었거나 유효하지 않습니다.\n\n" +
				"서버에서 claude 실행 → /login 명령으로 재인증하거나,\n" +
				"Settings → Models 에서 API 키를 확인해 주세요."
		case strings.HasPrefix(lang, "ja"):
			return "⚠️ AI認証が期限切れまたは無効です。\n\n" +
				"サーバーで claude を実行 → /login コマンドで再認証するか、\n" +
				"Settings → Models でAPIキーを確認してください。"
		case strings.HasPrefix(lang, "zh"):
			return "⚠️ AI认证已过期或无效。\n\n" +
				"请在服务器上运行 claude → 使用 /login 命令重新认证，\n" +
				"或在 Settings → Models 中检查API密钥。"
		default:
			return "⚠️ AI authentication has expired or is invalid.\n\n" +
				"Please run `claude` on the server → use /login to re-authenticate,\n" +
				"or check your API key in Settings → Models."
		}
	default:
		return ""
	}
}
