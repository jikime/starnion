package grpc

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"time"

	proto "github.com/newstarnion/gateway/proto/agent"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
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

// TLSOptions bundles the optional transport-security paths for dialing the agent.
// When CAPath is empty, the client falls back to insecure credentials — but only
// if the target address is a loopback host.
type TLSOptions struct {
	CAPath     string // server-cert verification root
	CertPath   string // client cert (optional, enables mTLS)
	KeyPath    string // client key (required when CertPath is set)
	ServerName string // SNI / hostname override for server cert verification
}

// buildTransportCredentials decides between TLS and insecure based on TLSOptions
// and whether the target address is loopback. It refuses insecure dialing across
// the network so the agent never sees plaintext credentials from another host.
func buildTransportCredentials(addr string, opts TLSOptions) (credentials.TransportCredentials, error) {
	if opts.CAPath != "" {
		caPEM, err := os.ReadFile(opts.CAPath)
		if err != nil {
			return nil, fmt.Errorf("read agent TLS CA %s: %w", opts.CAPath, err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(caPEM) {
			return nil, fmt.Errorf("agent TLS CA %s contains no valid certificates", opts.CAPath)
		}
		tlsCfg := &tls.Config{
			RootCAs:    pool,
			MinVersion: tls.VersionTLS12,
		}
		if opts.ServerName != "" {
			tlsCfg.ServerName = opts.ServerName
		}
		if opts.CertPath != "" || opts.KeyPath != "" {
			if opts.CertPath == "" || opts.KeyPath == "" {
				return nil, fmt.Errorf("agent TLS requires both cert and key paths for mTLS")
			}
			cert, err := tls.LoadX509KeyPair(opts.CertPath, opts.KeyPath)
			if err != nil {
				return nil, fmt.Errorf("load agent TLS client keypair: %w", err)
			}
			tlsCfg.Certificates = []tls.Certificate{cert}
		}
		return credentials.NewTLS(tlsCfg), nil
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	if !isLoopbackHost(host) {
		return nil, fmt.Errorf(
			"refusing to dial non-loopback agent %q without TLS; set AGENT_GRPC_TLS_CA or bind agent to localhost",
			addr,
		)
	}
	return insecure.NewCredentials(), nil
}

// base64DecodeTolerant decodes either standard or URL-safe base64 and,
// failing that, returns the original bytes untouched so the agent can at
// least attempt a passthrough. Images coming from Telegram are standard
// base64; some clients use URL-safe encoding.
func base64DecodeTolerant(s string) ([]byte, error) {
	if s == "" {
		return nil, nil
	}
	if b, err := base64.StdEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	if b, err := base64.URLEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	if b, err := base64.RawStdEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	return nil, fmt.Errorf("base64 decode failed for %d-byte payload", len(s))
}

func isLoopbackHost(host string) bool {
	if host == "localhost" {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback()
	}
	return false
}

// NewAgentClient dials the agent gRPC server and returns a ready-to-use client.
// sharedSecret is attached to every outgoing call as the "x-shared-secret" metadata header.
// When tls.CAPath is empty the client refuses to dial a non-loopback address to prevent
// plaintext credentials crossing the network.
func NewAgentClient(addr, sharedSecret string, tlsOpts TLSOptions, logger *zap.Logger) (*AgentClient, error) {
	// Defensive check — config.Load() already fail-fasts when the shared
	// secret is empty, but a test or future bootstrap variant that skips
	// config validation would otherwise build an unauthenticated client
	// and send RPCs in the clear. Refuse here as well.
	if sharedSecret == "" {
		return nil, fmt.Errorf("agent grpc client: refusing to build without a shared secret")
	}
	creds, err := buildTransportCredentials(addr, tlsOpts)
	if err != nil {
		return nil, err
	}
	const maxMsgSize = 16 * 1024 * 1024 // 16 MiB — covers 4+ MB Telegram photos
	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(creds),
		// Explicit message size. Previously the default 4 MiB applied,
		// which meant a single larger image or a batched VisionInputs
		// payload could be rejected with RESOURCE_EXHAUSTED. 16 MiB gives
		// headroom for the worst realistic payload (four 4 MB images).
		grpc.WithDefaultCallOptions(
			grpc.MaxCallSendMsgSize(maxMsgSize),
			grpc.MaxCallRecvMsgSize(maxMsgSize),
		),
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

// ImageContent holds a raw image payload for vision requests. The bytes
// are passed to the agent through the typed proto `ImageContent.data`
// field — no base64 round-trip on the gateway→agent hop. The agent
// re-encodes to base64 only when handing the image to the LLM wrapper,
// which expects a base64 string for historical reasons.
type ImageContent struct {
	Data     []byte `json:"Data"`     // raw bytes
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
	Type             string  // "text", "tool_use", "tool_result", "done", "error"
	Text             string  // type == "text"
	ToolName         string  // type == "tool_use" | "tool_result"
	InputJSON        string  // type == "tool_use"
	Result           string  // type == "tool_result"
	IsError          bool    // type == "tool_result"
	SessionID        string  // type == "done"
	InputTokens      int     // type == "done"
	OutputTokens     int     // type == "done"
	CacheReadTokens  int     // type == "done" — tokens served from prompt cache
	CacheWriteTokens int     // type == "done" — tokens written to prompt cache
	TotalCostUSD     float64 // type == "done" — estimated cost in USD
	Model            string  // type == "done" — model used for this turn
	ContextTokens    int     // type == "done" — current context usage in tokens (0 if unknown)
	ContextWindow    int     // type == "done" — model context window size in tokens
	ErrorMsg         string  // type == "error"
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

// ChatInput groups all per-request parameters for StreamChat. Using a
// struct with named fields eliminates the prior 17-positional-argument
// signature — callers can no longer accidentally swap `fallbackProviders`
// and `skillEnvJSON`, which were both plain strings. Defaults for
// unspecified fields are the zero value.
type ChatInput struct {
	UserID    string
	SessionID string
	Message   string
	Model     string

	Provider       string
	APIKey         string
	SystemPrompt   string
	Timezone       string
	SecondaryModel string

	PreviousMessages    []PreviousMessage
	Images              []ImageContent
	ImageURLs           []ImageURL
	ConfiguredProviders []string
	Platform            string

	// The three JSON-string fields below are still accepted as strings
	// because the existing resolver helpers produce them that way; the
	// eventual next step is to plumb typed slices from the resolvers so
	// StreamChat does not need to re-parse JSON on the hot path.
	FallbackProviders  string
	SkillEnvJSON       string
	DisabledSkillsJSON string
}

// StreamChat calls the agent Chat RPC and streams decoded events to the
// out channel. The channel is closed when streaming is complete or ctx
// is cancelled. See ChatInput for per-field semantics.
func (c *AgentClient) StreamChat(ctx context.Context, in ChatInput) (<-chan ChatEvent, error) {
	userID := in.UserID
	sessionID := in.SessionID
	message := in.Message
	model := in.Model
	provider := in.Provider
	apiKey := in.APIKey
	systemPrompt := in.SystemPrompt
	timezone := in.Timezone
	secondaryModel := in.SecondaryModel
	previousMessages := in.PreviousMessages
	images := in.Images
	imageURLs := in.ImageURLs
	configuredProviders := in.ConfiguredProviders
	platform := in.Platform
	fallbackProviders := in.FallbackProviders
	skillEnvJSON := in.SkillEnvJSON
	disabledSkillsJSON := in.DisabledSkillsJSON
	// ── ProviderConfig ────────────────────────────────────────────────────
	providerCfg := &proto.ProviderConfig{
		Name:                provider,
		ApiKey:              apiKey,
		SecondaryModel:      secondaryModel,
		ConfiguredProviders: append([]string(nil), configuredProviders...),
	}
	if fallbackProviders != "" {
		var chain []struct {
			Provider string `json:"provider"`
			APIKey   string `json:"api_key"`
			Model    string `json:"model"`
			BaseURL  string `json:"base_url,omitempty"`
		}
		if err := json.Unmarshal([]byte(fallbackProviders), &chain); err == nil {
			for _, entry := range chain {
				providerCfg.FallbackChain = append(providerCfg.FallbackChain, &proto.FallbackProvider{
					Provider: entry.Provider,
					ApiKey:   entry.APIKey,
					Model:    entry.Model,
					BaseUrl:  entry.BaseURL,
				})
			}
		} else {
			c.logger.Warn("fallback provider chain parse failed", zap.Error(err))
		}
	}

	// ── ChatHistory ───────────────────────────────────────────────────────
	var history *proto.ChatHistory
	if len(previousMessages) > 0 {
		history = &proto.ChatHistory{Messages: make([]*proto.PreviousMessage, 0, len(previousMessages))}
		for _, pm := range previousMessages {
			history.Messages = append(history.Messages, &proto.PreviousMessage{
				Role:    pm.Role,
				Content: pm.Content,
			})
		}
	}

	// ── VisionInputs ──────────────────────────────────────────────────────
	// ImageContent.Data is already a []byte now, so we forward it directly
	// to the proto bytes field without any base64 dance. Previously we
	// paid encode (caller) → decode (here) → encode (agent) for the same
	// payload on every Telegram photo; the caller side now skips encode.
	var vision *proto.VisionInputs
	if len(images) > 0 || len(imageURLs) > 0 {
		vision = &proto.VisionInputs{}
		for _, img := range images {
			vision.Images = append(vision.Images, &proto.ImageContent{
				Data:     img.Data,
				MimeType: img.MimeType,
			})
		}
		for _, u := range imageURLs {
			vision.ImageUrls = append(vision.ImageUrls, &proto.ImageURL{
				Url:      u.URL,
				MimeType: u.MimeType,
			})
		}
	}

	// ── SkillConfig ───────────────────────────────────────────────────────
	var skillCfg *proto.SkillConfig
	if skillEnvJSON != "" || disabledSkillsJSON != "" {
		skillCfg = &proto.SkillConfig{}
		if skillEnvJSON != "" {
			env := map[string]string{}
			if err := json.Unmarshal([]byte(skillEnvJSON), &env); err == nil {
				skillCfg.Env = env
			} else {
				c.logger.Warn("skill env json parse failed", zap.Error(err))
			}
		}
		if disabledSkillsJSON != "" {
			var disabled []string
			if err := json.Unmarshal([]byte(disabledSkillsJSON), &disabled); err == nil {
				skillCfg.Disabled = disabled
			} else {
				c.logger.Warn("disabled skills json parse failed", zap.Error(err))
			}
		}
	}

	req := &proto.ChatRequest{
		UserId:      userID,
		SessionId:   sessionID,
		Message:     message,
		Model:       model,
		Provider:    providerCfg,
		UserContext: &proto.UserContext{Timezone: timezone},
		Persona:     &proto.PersonaConfig{SystemPrompt: systemPrompt},
		History:     history,
		Vision:      vision,
		Skills:      skillCfg,
		Client:      &proto.ClientInfo{Platform: platform},
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
