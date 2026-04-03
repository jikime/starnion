package grpc

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/newstarnion/gateway/internal/infrastructure/grpc/proto"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// AgentClient wraps the gRPC connection to the agent service.
type AgentClient struct {
	conn         *grpc.ClientConn
	client       proto.AgentServiceClient
	logger       *zap.Logger
	sharedSecret string
}

// NewAgentClient dials the agent gRPC server and returns a ready-to-use client.
// sharedSecret is attached to every outgoing call as the "x-shared-secret" metadata header.
func NewAgentClient(addr, sharedSecret string, logger *zap.Logger) (*AgentClient, error) {
	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		// Keepalive: ping every 10s of inactivity so dead connections are detected quickly.
		grpc.WithKeepaliveParams(keepalive.ClientParameters{
			Time:                10 * time.Second,
			Timeout:             5 * time.Second,
			PermitWithoutStream: true,
		}),
	}
	if sharedSecret != "" {
		opts = append(opts,
			grpc.WithUnaryInterceptor(func(ctx context.Context, method string, req, reply any, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, callOpts ...grpc.CallOption) error {
				ctx = metadata.AppendToOutgoingContext(ctx, "x-shared-secret", sharedSecret)
				return invoker(ctx, method, req, reply, cc, callOpts...)
			}),
			grpc.WithStreamInterceptor(func(ctx context.Context, desc *grpc.StreamDesc, cc *grpc.ClientConn, method string, streamer grpc.Streamer, callOpts ...grpc.CallOption) (grpc.ClientStream, error) {
				ctx = metadata.AppendToOutgoingContext(ctx, "x-shared-secret", sharedSecret)
				return streamer(ctx, desc, cc, method, callOpts...)
			}),
		)
	}
	conn, err := grpc.NewClient(addr, opts...)
	if err != nil {
		return nil, fmt.Errorf("dial agent gRPC %s: %w", addr, err)
	}
	return &AgentClient{
		conn:         conn,
		client:       proto.NewAgentServiceClient(conn),
		logger:       logger,
		sharedSecret: sharedSecret,
	}, nil
}

// Close tears down the gRPC connection.
func (c *AgentClient) Close() error {
	return c.conn.Close()
}

// PreviousMessage is a role/content pair sent to the agent for context reconstruction.
type PreviousMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ImageContent holds a base64-encoded image for vision requests.
type ImageContent struct {
	Data     string `json:"Data"`     // base64-encoded bytes
	MimeType string `json:"MimeType"` // e.g. "image/jpeg"
}

// ImageURL holds a URL reference to an image for vision requests.
// The agent will fetch and base64-encode the image before passing it to the LLM.
type ImageURL struct {
	URL      string `json:"URL"`
	MimeType string `json:"MimeType"` // e.g. "image/jpeg"
}

// ChatEvent is a decoded event from the agent stream.
type ChatEvent struct {
	Type      string // "text", "tool_use", "tool_result", "done", "error"
	Text      string // type == "text"
	ToolName  string // type == "tool_use" | "tool_result"
	InputJSON string // type == "tool_use"
	Result    string // type == "tool_result"
	IsError   bool   // type == "tool_result"
	SessionID        string  // type == "done"
	InputTokens      int     // type == "done"
	OutputTokens     int     // type == "done"
	CacheReadTokens  int     // type == "done" — tokens served from prompt cache
	CacheWriteTokens int     // type == "done" — tokens written to prompt cache
	TotalCostUSD     float64 // type == "done" — estimated cost in USD
	Model            string  // type == "done" — model used for this turn
	ContextTokens    int     // type == "done" — current context usage in tokens (0 if unknown)
	ContextWindow    int     // type == "done" — model context window size in tokens
	ErrorMsg  string // type == "error"
}

// Generate calls the agent Generate RPC for one-shot text generation.
// It uses Claude Haiku by default (fast, cheap) which is ideal for summaries and reports.
func (c *AgentClient) Generate(ctx context.Context, prompt, model string) (string, error) {
	if model == "" {
		model = "claude-haiku-4-5"
	}
	resp, err := c.client.Generate(ctx, &proto.GenerateRequest{Prompt: prompt, Model: model})
	if err != nil {
		return "", fmt.Errorf("agent generate: %w", err)
	}
	if resp.Error != "" {
		return "", fmt.Errorf("agent generate error: %s", resp.Error)
	}
	return resp.Text, nil
}

// StreamChat calls the agent Chat RPC and streams decoded events to the out channel.
// The channel is closed when streaming is complete or ctx is cancelled.
// provider, apiKey, systemPrompt are passed via the metadata map; empty strings are omitted.
// images, if non-empty, are JSON-serialised into metadata["images"] for vision requests (base64).
// imageURLs, if non-empty, are JSON-serialised into metadata["image_urls"]; the agent fetches and encodes them.
func (c *AgentClient) StreamChat(ctx context.Context, userID, sessionID, message, model, provider, apiKey, systemPrompt, timezone, secondaryModel string, previousMessages []PreviousMessage, images []ImageContent, imageURLs []ImageURL, configuredProviders []string, platform string, fallbackProviders string, skillEnvJSON string, disabledSkillsJSON string) (<-chan ChatEvent, error) {
	metadata := map[string]string{}
	if provider != "" {
		metadata["provider"] = provider
	}
	if apiKey != "" {
		metadata["api_key"] = apiKey
	}
	if systemPrompt != "" {
		metadata["system_prompt"] = systemPrompt
	}
	if timezone != "" {
		metadata["timezone"] = timezone
	}
	if secondaryModel != "" {
		metadata["secondary_model"] = secondaryModel
	}
	if len(previousMessages) > 0 {
		data, err := json.Marshal(previousMessages)
		if err == nil {
			metadata["previous_messages"] = string(data)
		}
	}
	if len(images) > 0 {
		data, err := json.Marshal(images)
		if err == nil {
			metadata["images"] = string(data)
		}
	}
	if len(imageURLs) > 0 {
		data, err := json.Marshal(imageURLs)
		if err == nil {
			metadata["image_urls"] = string(data)
		}
	}
	if len(configuredProviders) > 0 {
		data, err := json.Marshal(configuredProviders)
		if err == nil {
			metadata["configured_providers"] = string(data)
		}
	}
	if platform != "" {
		metadata["platform"] = platform
	}
	if fallbackProviders != "" {
		metadata["fallback_providers"] = fallbackProviders
	}
	if skillEnvJSON != "" {
		metadata["skill_env_json"] = skillEnvJSON
	}
	if disabledSkillsJSON != "" {
		metadata["disabled_skills_json"] = disabledSkillsJSON
	}
	req := &proto.ChatRequest{
		UserId:    userID,
		SessionId: sessionID,
		Message:   message,
		Model:     model,
		Metadata:  metadata,
	}

	// Retry the stream dial up to 3 times with exponential backoff.
	// gRPC transient connection failures (e.g. agent restart) are recoverable.
	var (
		stream proto.AgentService_ChatClient
		err    error
	)
	for attempt := 0; attempt < 3; attempt++ {
		stream, err = c.client.Chat(ctx, req)
		if err == nil {
			break
		}
		// Only retry on transient errors (server unavailable / deadline exceeded).
		// Permanent errors (invalid argument, unauthenticated, etc.) should fail fast.
		if code := status.Code(err); code != codes.Unavailable && code != codes.DeadlineExceeded {
			break
		}
		if attempt < 2 {
			backoff := time.Duration(1<<uint(attempt)) * 500 * time.Millisecond
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(backoff):
			}
			c.logger.Warn("chat stream dial retry",
				zap.Int("attempt", attempt+1),
				zap.Error(err))
		}
	}
	if err != nil {
		return nil, fmt.Errorf("start chat stream: %w", err)
	}

	// eventChanBuf: buffer events for smooth streaming; increase for high-burst workloads.
	const eventChanBuf = 128
	// streamIdleTimeout: if no event is received from the agent for this duration,
	// the stream is considered stuck and terminated with an error. Prevents
	// a hung agent from holding a slot for the full 5-minute request timeout.
	const streamIdleTimeout = 180 * time.Second

	out := make(chan ChatEvent, eventChanBuf)

	// recvCh decouples the blocking stream.Recv() call from the idle-timeout
	// select so we can time-out without cancelling the parent ctx.
	type recvResult struct {
		resp *proto.ChatResponse
		err  error
	}
	recvCh := make(chan recvResult, 1)

	// recv goroutine: forwards raw responses; exits on any error (incl. EOF).
	go func() {
		for {
			resp, err := stream.Recv()
			recvCh <- recvResult{resp, err}
			if err != nil {
				return
			}
		}
	}()

	go func() {
		defer close(out)
		idleTimer := time.NewTimer(streamIdleTimeout)
		defer idleTimer.Stop()

		for {
			select {
			case result := <-recvCh:
				// Reset idle timer on every received frame.
				if !idleTimer.Stop() {
					select {
					case <-idleTimer.C:
					default:
					}
				}
				idleTimer.Reset(streamIdleTimeout)

				if result.err != nil {
					if result.err != io.EOF {
						select {
						case out <- ChatEvent{Type: "error", ErrorMsg: result.err.Error()}:
						case <-ctx.Done():
						}
					}
					return
				}

				var ev ChatEvent
				switch e := result.resp.Event.(type) {
				case *proto.ChatResponse_TextDelta:
					ev = ChatEvent{Type: "text", Text: e.TextDelta.Text}
				case *proto.ChatResponse_ToolUse:
					ev = ChatEvent{Type: "tool_use", ToolName: e.ToolUse.ToolName, InputJSON: e.ToolUse.InputJson}
				case *proto.ChatResponse_ToolResult:
					ev = ChatEvent{Type: "tool_result", ToolName: e.ToolResult.ToolName, Result: e.ToolResult.Result, IsError: e.ToolResult.IsError}
				case *proto.ChatResponse_Done:
					ev = ChatEvent{
						Type:             "done",
						SessionID:        e.Done.SessionId,
						InputTokens:      int(e.Done.InputTokens),
						OutputTokens:     int(e.Done.OutputTokens),
						CacheReadTokens:  int(e.Done.CacheReadTokens),
						CacheWriteTokens: int(e.Done.CacheWriteTokens),
						TotalCostUSD:     e.Done.TotalCostUsd,
						Model:            e.Done.Model,
						ContextTokens:    int(e.Done.ContextTokens),
						ContextWindow:    int(e.Done.ContextWindow),
					}
				case *proto.ChatResponse_Error:
					ev = ChatEvent{Type: "error", ErrorMsg: e.Error.Message}
				default:
					continue
				}

				select {
				case out <- ev:
				case <-ctx.Done():
					return
				}

			case <-idleTimer.C:
				c.logger.Warn("chat stream idle timeout — no events received",
					zap.Duration("timeout", streamIdleTimeout))
				select {
				case out <- ChatEvent{Type: "error", ErrorMsg: "stream idle timeout: agent is not responding"}:
				default:
				}
				return

			case <-ctx.Done():
				return
			}
		}
	}()

	return out, nil
}
