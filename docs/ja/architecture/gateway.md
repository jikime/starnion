---
title: Gateway (Go)
nav_order: 2
parent: アーキテクチャ
grand_parent: 🇯🇵 日本語
---

# Gateway (Go)

## 役割

GatewayはStarnionの**トラフィックハブ**です。Goで書かれており、以下の役割を担います：

- **REST APIサーバー**：UIと外部クライアントにAPIエンドポイントを提供
- **WebSocketサーバー**：リアルタイムウェブチャットハブを運用
- **Telegramボット管理者**：ユーザーごとに複数のTelegramボットインスタンスを管理
- **Cronスケジューラー**：定期的な通知、レポート、予算警告を自動実行
- **gRPCクライアント**：PythonエージェントGatewayと通信してAI応答をリクエスト

---

## システム図

```
クライアント（ブラウザ/アプリ）
        │
        ├── HTTP REST ──────────────────────────────────┐
        ├── WebSocket (wss://) ─────────────────────── │
        └── Telegram Bot API ─────────────────────────│
                                                        ▼
                                            ┌─────────────────────┐
                                            │   Gateway (Go)      │
                                            │                     │
                                            │  Echo Router        │
                                            │  BotManager         │
                                            │  Scheduler (Cron)   │
                                            │  WebSocket Hub      │
                                            └──────┬──────────────┘
                                                   │ gRPC
                                                   ▼
                                            ┌─────────────────────┐
                                            │   Agent (Python)    │
                                            │   gRPC :50051       │
                                            └─────────────────────┘
                                                   │
                                            ┌──────┴──────┐
                                            │  PostgreSQL  │
                                            │   pgvector   │
                                            └─────────────┘
```

---

## 主要コンポーネント

### Echo Router

[labstack/echo](https://echo.labstack.com/) v4を使用しています。すべてのHTTPルートは `main.go` に登録されます。

### BotManager

ユーザーごとにTelegramボットを管理します。ユーザーがTelegramボットトークンを登録すると、BotManagerがそのボットインスタンスを作成してアップデートのポーリングを開始します。サーバーの再起動時には、DBに保存されているすべてのボットトークンを自動的に再ロードします（`ReloadAll()`）。

### WebSocket Hub

ウェブチャットのリアルタイム接続ハブです。JWT認証による接続を受け入れ、AgentのgRPCストリーミング応答をリアルタイムでクライアントに中継します。

### Cron スケジューラー

[robfig/cron](https://github.com/robfig/cron) v3を使用し、KST（UTC+9）で動作します。詳細は以下の[Cronスケジュール](#cronスケジュール)セクションを参照してください。

### gRPCクライアント

protobufで定義された `AgentService` を呼び出します。単項リクエスト（Chat）とサーバーストリーミング（ChatStream）の2つのモードで通信します。

---

## 認証

すべてのAPIリクエストはJWTベースの認証を使用します。

```
Authorization: Bearer <jwt_token>
```

トークンは `/auth/token` エンドポイントで発行されます。ウェブユーザーはNextAuthセッションを通じて自動的にトークンを取得します。Telegramユーザーはプラットフォームのidに基づいてトークンが管理されます。

---

## ミドルウェア

リクエストがルートハンドラーに到達する前に、以下のミドルウェアが順番に実行されます。

| ミドルウェア | 機能 |
|-----------|------|
| RequestID | すべてのリクエストにユニークなIDを割り当てます（`X-Request-ID`） |
| Recover | ハンドラーのパニックを500応答として安全に回復します |
| CORS | 許可されたオリジン、メソッド、ヘッダーをフィルタリングします |
| RequestLogger | zerologベースのリクエスト/レスポンスロギング |

---

## 完全なAPIエンドポイントリスト

### 認証

| メソッド | パス | 説明 |
|---------|-----|------|
| POST | `/auth/register` | メール/パスワードによる登録 |
| POST | `/auth/login` | メール/パスワードによるログイン |
| POST | `/auth/token` | 匿名JWTトークンの発行 |
| POST | `/auth/link` | ウェブアカウントとTelegramアカウントをリンク |
| GET | `/auth/google/callback` | Google OAuth2コールバックの処理 |
| GET | `/auth/google/telegram` | TelegramボットからGoogle OAuthを開始 |

### チャット

| メソッド | パス | 説明 |
|---------|-----|------|
| POST | `/api/v1/chat` | 単項チャットリクエスト |
| POST | `/api/v1/chat/stream` | SSEストリーミングチャット（AI SDK互換） |
| GET | `/ws` | WebSocketリアルタイムチャット接続 |

### 会話

| メソッド | パス | 説明 |
|---------|-----|------|
| GET | `/api/v1/conversations` | 会話のリスト |
| POST | `/api/v1/conversations` | 新しい会話を作成 |
| PATCH | `/api/v1/conversations/:id` | 会話タイトルを更新 |
| GET | `/api/v1/conversations/:id/messages` | 会話メッセージのリスト |

### 財務管理

| メソッド | パス | 説明 |
|---------|-----|------|
| GET | `/api/v1/finance/summary` | 収入/支出の概要 |
| GET | `/api/v1/finance/transactions` | 取引のリスト |
| POST | `/api/v1/finance/transactions` | 新しい取引を追加 |
| PUT | `/api/v1/finance/transactions/:id` | 取引を編集 |
| DELETE | `/api/v1/finance/transactions/:id` | 取引を削除 |
| GET | `/api/v1/budget` | 予算の表示 |
| PUT | `/api/v1/budget` | 予算の設定 |
| GET | `/api/v1/statistics` | 支出統計 |
| GET | `/api/v1/statistics/insights` | 支出インサイト |

### 個人データ

| メソッド | パス | 説明 |
|---------|-----|------|
| GET/POST | `/api/v1/diary/entries` | 日記リスト/作成 |
| GET/PUT/DELETE | `/api/v1/diary/entries/:id` | 日記の詳細/編集/削除 |
| GET/POST | `/api/v1/goals` | 目標リスト/作成 |
| POST | `/api/v1/goals/:id/checkin` | 目標チェックイン |
| GET/POST | `/api/v1/memos` | メモリスト/作成 |
| PUT/DELETE | `/api/v1/memos/:id` | メモの編集/削除 |
| GET/POST | `/api/v1/ddays` | Dデイリスト/作成 |

### 設定とモデル

| メソッド | パス | 説明 |
|---------|-----|------|
| GET/PATCH | `/api/v1/profile` | プロフィールの表示/更新 |
| GET/POST | `/api/v1/providers` | LLMプロバイダーリスト/登録 |
| POST | `/api/v1/providers/validate` | APIキーの検証 |
| DELETE | `/api/v1/providers/:provider` | プロバイダーの削除 |
| GET/POST | `/api/v1/personas` | ペルソナリスト/作成 |
| PUT/DELETE | `/api/v1/personas/:id` | ペルソナの編集/削除 |

### 連携

| メソッド | パス | 説明 |
|---------|-----|------|
| GET | `/api/v1/integrations/status` | 連携ステータスの表示 |
| GET | `/api/v1/integrations/google/auth-url` | Google OAuth URLの生成 |
| DELETE | `/api/v1/integrations/google` | Googleの接続解除 |
| PUT | `/api/v1/integrations/notion` | Notionの接続 |
| PUT | `/api/v1/integrations/tavily` | Tavilyウェブ検索の接続 |
| PUT | `/api/v1/integrations/naver_search` | Naver検索の接続 |

### ファイルとメディア

| メソッド | パス | 説明 |
|---------|-----|------|
| POST | `/api/v1/upload` | ファイルのアップロード（MinIO） |
| GET/POST/DELETE | `/api/v1/documents` | ドキュメント管理 |
| GET/DELETE | `/api/v1/images` | 画像ギャラリー |
| GET/POST/DELETE | `/api/v1/audios` | 音声ギャラリー |

### 分析とモニタリング

| メソッド | パス | 説明 |
|---------|-----|------|
| GET | `/api/v1/analytics` | 会話分析統計 |
| GET | `/api/v1/usage` | LLMトークン使用状況 |
| GET | `/api/v1/logs` | Gatewayログリスト |
| GET | `/api/v1/logs/stream` | リアルタイムログストリーミング（SSE） |
| GET | `/api/v1/logs/agent` | PythonエージェントログのProxy |

---

## Cronスケジュール

スケジューラーはKST（UTC+9）で動作します。

| スケジュール | ジョブ | 説明 |
|-----------|------|------|
| 毎週月曜日 09:00 | weekly_report | 週次費用レポートの送信 |
| 毎時間 | budget_warning | 予算超過のチェック |
| 毎日 21:00 | daily_summary | 日次サマリーの送信 |
| 毎日 20:00 | inactive_reminder | 非アクティブユーザーへの通知 |
| 28〜31日 21:00 | monthly_closing | 月末締め通知 |
| 毎日 06:00 | pattern_analysis | 支出パターンの分析 |
| 3時間ごと | spending_anomaly | 異常な支出の検出 |
| 毎日 14:00 | pattern_insight | パターンベースのインサイトの送信 |
| 10分ごと | conversation_analysis | 会話分析（アイドル検出） |
| 毎日 07:00 | goal_evaluation | 目標完了の評価 |
| 毎週水曜日 12:00 | goal_status | 目標ステータスの通知 |
| 毎日 08:00 | dday_notification | Dデイ通知 |
| 15分ごと | user_schedules | ユーザー定義スケジュールの実行 |
| 毎週月曜日 05:00 | memory_compaction | メモリの圧縮（AIログのクリーンアップ） |

---

## ログの表示

Gatewayログはzerologベースの構造化JSONログとして記録されます。

### Web UIでの表示

設定 > ログでリアルタイムログストリームを表示できます。新しいログは `GET /api/v1/logs/stream` SSEエンドポイントを通じてリアルタイムで更新されます。

### Dockerログ

```bash
docker compose logs -f gateway
docker compose logs -f agent
```

### ログレベル

`LOG_LEVEL` 環境変数で調整可能：`debug`、`info`、`warn`、`error`。

---

## 技術スタックの概要

| 項目 | 選択 | バージョン |
|-----|-----|---------|
| 言語 | Go | 1.25 |
| ウェブフレームワーク | labstack/echo | v4.15 |
| gRPC | google.golang.org/grpc | v1.79 |
| WebSocket | gorilla/websocket | v1.5 |
| データベースドライバー | lib/pq | v1.11 |
| スケジューラー | robfig/cron | v3 |
| オブジェクトストレージ | minio/minio-go | v7 |
| JWT | golang-jwt/jwt | v5 |
| ロガー | rs/zerolog | v1.34 |
| CLI | spf13/cobra | v1.10 |

---

## IDサービス：マルチプラットフォームユーザーの統合

同じユーザーがウェブとTelegramの両方を使用する場合、同じ `user_id` の下に紐付けられます。

```
Telegram chat_id: 12345  ──▶ platform_identities ──▶ user_id: "abc-uuid"
Web session_id: "xxx"    ──▶ platform_identities ──▶ user_id: "abc-uuid"
```

アカウントリンクフロー：

1. Telegramで `/link` コマンドを入力
2. 10分間有効なリンクコード `NION-XXXXXX` が発行される
3. ウェブから `POST /auth/link { "code": "NION-XXXXXX" }` を呼び出す
4. 両方のプラットフォームが同じ `user_id` に統合される
