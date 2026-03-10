package cli

import (
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/term"
)

// newAskCmd returns the 'starnion ask' one-shot question command.
func newAskCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "ask [question]",
		Short: "AI에게 한 번 질문 (파이프 지원)",
		Long:  "질문 하나를 AI에게 보내고 답변을 출력합니다.\n파이프: cat file.txt | starnion ask \"요약해줘\"",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runAsk(args)
		},
	}
}

func runAsk(args []string) error {
	gatewayURL, token, userID, err := ResolveCLICredentials()
	if err != nil {
		PrintFail("인증", err.Error())
		return err
	}

	// Determine the question.
	var question string
	if len(args) > 0 {
		question = strings.Join(args, " ")
	} else if !term.IsTerminal(int(os.Stdin.Fd())) {
		// stdin is piped — read all of it as the question.
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			return fmt.Errorf("stdin 읽기 실패: %w", err)
		}
		question = strings.TrimSpace(string(data))
		if question == "" {
			return fmt.Errorf("stdin에서 질문을 읽었지만 내용이 없습니다")
		}
	} else {
		return fmt.Errorf("질문을 입력해주세요. 예: starnion ask \"안녕?\"")
	}

	// Create a conversation for history (warn but don't fail).
	threadID, err := createConversation(gatewayURL, token, userID)
	if err != nil {
		PrintWarn("대화", fmt.Sprintf("대화 세션 생성 실패 (메시지가 저장되지 않을 수 있음): %v", err))
	}

	// Stream the answer.
	if err := streamChat(gatewayURL, token, userID, threadID, question); err != nil {
		return err
	}
	fmt.Println()
	return nil
}
