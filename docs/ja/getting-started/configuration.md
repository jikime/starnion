---
layout: default
title: 設定
nav_order: 4
parent: はじめに
grand_parent: 🇯🇵 日本語
---

# 設定
{: .no_toc }

<details open markdown="block">
  <summary>目次</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 概要

Starnionの設定は2つの方法で管理されます。

1. **セットアップウィザード** (`starnion setup`) — 対話式の初期設定
2. **環境ファイル** (`docker/.env`) — 直接編集

---

## セットアップウィザード

`starnion setup` コマンドは、コア設定をガイドする対話式ウィザードです。

```bash
starnion setup
```

ウィザードのステップ：

| ステップ | 設定項目 | 保存先 |
|---------|---------|-------|
| 1. システムチェック | PostgreSQL、MinIO接続テスト | - |
| 2. データベース | DB URL、マイグレーションの実行 | `~/.config/starnion/config.yaml` |
| 3. 管理者アカウント | メール、パスワードの作成 | PostgreSQL |
| 4. ファイルストレージ | MinIOエンドポイント、認証情報、バケット | `~/.config/starnion/config.yaml` |
| 5. サービスURL | GatewayパブリックURL | `~/.config/starnion/config.yaml` |

ウィザード完了後、設定は `~/.config/starnion/config.yaml` に保存されます。

---

## 環境変数の完全リファレンス

このセクションでは、`docker/.env` ファイルのすべての環境変数について説明します。

### 必須シークレット（必ず変更すること）

本番環境ではデフォルト値を絶対に使用しないでください。

| 変数 | デフォルト | 説明 |
|-----|---------|------|
| `POSTGRES_PASSWORD` | `change-me-in-production` | PostgreSQLデータベースパスワード |
| `MINIO_SECRET_KEY` | `change-me-in-production` | MinIOオブジェクトストレージのシークレットキー |
| `JWT_SECRET` | `change-me-min-32-chars-in-production` | JWTトークン署名キー（最低32文字） |
| `AUTH_SECRET` | `change-me-min-32-chars-in-production` | NextAuthセッション暗号化キー（最低32文字） |

安全なランダム値の生成：

```bash
# JWT_SECRETまたはAUTH_SECRETを生成
openssl rand -base64 32

# 出力例：
# K8mN3pQ7rS1tU5wX9yZ2aB4cD6eF0gH=
```

`.env` ファイルに設定：

```dotenv
POSTGRES_PASSWORD=MySecurePassword123!
MINIO_SECRET_KEY=AnotherSecureKey456!
JWT_SECRET=K8mN3pQ7rS1tU5wX9yZ2aB4cD6eF0gHj2k4l6m8n0
AUTH_SECRET=P1q3r5s7t9u1v3w5x7y9z1a3b5c7d9e1f3g5h7i9
```

### PostgreSQL設定

| 変数 | デフォルト | 説明 |
|-----|---------|------|
| `POSTGRES_DB` | `starnion` | データベース名 |
| `POSTGRES_USER` | `starnion` | データベースユーザー名 |
| `POSTGRES_PASSWORD` | _（必須）_ | データベースパスワード |
| `POSTGRES_PORT` | `5432` | PostgreSQLポート |

完全なデータベースURL形式：

```
postgres://[USER]:[PASSWORD]@[HOST]:[PORT]/[DB]?sslmode=disable
```

例：

```dotenv
# Dockerコンテナ間の通信（ホスト名：postgres）
DATABASE_URL=postgres://starnion:MyPassword@postgres:5432/starnion?sslmode=disable

# 外部PostgreSQLサーバー
DATABASE_URL=postgres://starnion:MyPassword@db.example.com:5432/starnion?sslmode=require
```

### MinIO（ファイルストレージ）設定

| 変数 | デフォルト | 説明 |
|-----|---------|------|
| `MINIO_ACCESS_KEY` | `starnion` | MinIOアクセスキー（ユーザー名） |
| `MINIO_SECRET_KEY` | _（必須）_ | MinIOシークレットキー（パスワード） |
| `MINIO_BUCKET` | `starnion-files` | ファイルストレージのバケット名 |
| `MINIO_PORT` | `9000` | MinIO APIポート |
| `MINIO_CONSOLE_PORT` | `9001` | MinIO Webコンソールポート |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | ファイルアクセス用パブリックURL |

> **MinIOコンソール：** `http://localhost:9001` でMinIO Web管理コンソールにアクセスできます。
> `MINIO_ACCESS_KEY` と `MINIO_SECRET_KEY` でログインします。

### Gateway（APIサーバー）設定

| 変数 | デフォルト | 説明 |
|-----|---------|------|
| `GATEWAY_PORT` | `8080` | Gateway REST APIポート |
| `GATEWAY_PUBLIC_URL` | `http://localhost:8080` | GatewayパブリックURL（Google OAuthコールバックに使用） |
| `GRPC_PORT` | `50051` | Agent gRPC通信ポート |

### UI（Webインターフェース）設定

| 変数 | デフォルト | 説明 |
|-----|---------|------|
| `UI_PORT` | `3000` | Next.js Webサーバーポート |
| `NEXTAUTH_URL` | `http://localhost:3893` | NextAuthコールバックベースURL |
| `AUTH_SECRET` | _（必須）_ | NextAuthセッション暗号化キー |
| `JWT_SECRET` | _（必須）_ | JWTトークン検証キー（Gatewayと一致必須） |

### AIプロバイダーAPIキー

AI機能を使用するには、少なくとも1つのAIプロバイダーAPIキーが必要です。APIキーはWeb UIの設定ページでユーザーごとに入力することもできます。

| 変数 | 説明 | APIキーURL |
|-----|------|----------|
| `GEMINI_API_KEY` | Google Gemini APIキー | [aistudio.google.com](https://aistudio.google.com) |
| `OPENAI_API_KEY` | OpenAI GPT APIキー | [platform.openai.com](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | Anthropic Claude APIキー | [console.anthropic.com](https://console.anthropic.com) |

### Google OAuth設定（オプション）

Googleアカウントでのログインを有効にするには：

| 変数 | 説明 |
|-----|------|
| `GOOGLE_CLIENT_ID` | Google OAuthクライアントID |
| `GOOGLE_CLIENT_SECRET` | Google OAuthクライアントシークレット |
| `GOOGLE_REDIRECT_URI` | OAuthコールバックURL（自動設定） |

### Telegramボット設定（オプション）

TelegramでAIにアクセスするには：

| 変数 | 説明 |
|-----|------|
| `TELEGRAM_BOT_TOKEN` | Telegramボットトークン |

---

## APIキーの取得方法

### Google Gemini APIキー

1. [Google AI Studio](https://aistudio.google.com) にアクセス
2. Googleアカウントでログイン
3. 右上の **「Get API key」** をクリック
4. **「Create API key」** をクリック
5. プロジェクトを選択または新規作成
6. 生成されたAPIキーをコピー

```dotenv
GEMINI_API_KEY=AIzaSy...your-key-here
```

> **無料枠：** Gemini APIは一定の制限内で無料で使用でき、個人利用には十分です。

### OpenAI APIキー

1. [OpenAI Platform](https://platform.openai.com) にアクセス
2. アカウントを作成またはログイン
3. **API Keys** メニューに移動
4. **「+ Create new secret key」** をクリック
5. キー名を入力して作成
6. **すぐにキーをコピー** — 再度確認することはできません

```dotenv
OPENAI_API_KEY=sk-proj-...your-key-here
```

> **注意：** OpenAI APIは有料サービスです。使用量に応じて課金されます。

### Anthropic Claude APIキー

1. [Anthropic Console](https://console.anthropic.com) にアクセス
2. アカウントを作成またはログイン
3. **API Keys** セクションに移動
4. **「Create Key」** をクリック
5. キー名を入力して作成
6. 生成されたキーをコピー

```dotenv
ANTHROPIC_API_KEY=sk-ant-...your-key-here
```

### Telegramボットトークン

1. TelegramでBot **@BotFather** を検索
2. `/newbot` コマンドを送信
3. ボット名を入力（例：「My Starnion Bot」）
4. ボットのユーザー名を入力 — `_bot` で終わる必要があります（例：「my_starnion_bot」）
5. BotFatherが **トークン** を発行します

```dotenv
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
```

Telegramボットの設定後、Gatewayで有効化します。

```bash
# ボットWebhookの設定（オプション — ポーリングモードも対応）
starnion telegram setup
```

### Google OAuthクライアント（オプション）

Googleアカウントでのログイン用：

1. [Google Cloud Console](https://console.cloud.google.com) にアクセス
2. プロジェクトを作成または選択
3. **APIs & Services → Credentials** に移動
4. **「+ CREATE CREDENTIALS」→「OAuth 2.0 Client IDs」** をクリック
5. アプリケーションの種類：**Web application** を選択
6. **Authorized redirect URI** を追加：
   ```
   http://localhost:8080/auth/google/callback
   ```
7. 作成後、**クライアントID** と **クライアントシークレット** をコピー

```dotenv
GOOGLE_CLIENT_ID=123456789-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...your-secret
```

---

## .envファイルの完全な例

```dotenv
# ============================================================
# Starnion Docker環境設定
# ============================================================

# ---- 必須シークレット（必ず変更してください！） ----
POSTGRES_PASSWORD=MySecureDBPassword123!
MINIO_SECRET_KEY=MySecureMinIOKey456!
JWT_SECRET=K8mN3pQ7rS1tU5wX9yZ2aB4cD6eF0gHj2k4l6m8n0p2
AUTH_SECRET=P1q3r5s7t9u1v3w5x7y9z1a3b5c7d9e1f3g5h7i9j1

# ---- PostgreSQL ----
POSTGRES_DB=starnion
POSTGRES_USER=starnion
POSTGRES_PORT=5432

# ---- MinIO ----
MINIO_ACCESS_KEY=starnion
MINIO_BUCKET=starnion-files
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_PUBLIC_URL=http://localhost:9000

# ---- Gateway ----
GATEWAY_PORT=8080
GATEWAY_PUBLIC_URL=http://localhost:8080
GRPC_PORT=50051

# ---- UI ----
UI_PORT=3000
NEXTAUTH_URL=http://localhost:3893

# ---- AIプロバイダー（少なくとも1つ必須） ----
GEMINI_API_KEY=AIzaSy...
# OPENAI_API_KEY=sk-proj-...
# ANTHROPIC_API_KEY=sk-ant-...

# ---- オプション ----
# TELEGRAM_BOT_TOKEN=1234567890:ABC...
# GOOGLE_CLIENT_ID=123...apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=GOCSPX-...
```

---

## 本番デプロイ用の設定

### ドメインとHTTPS設定

外部からアクセス可能なサーバーにデプロイする場合：

```dotenv
# 実際のドメインに置き換えてください
GATEWAY_PUBLIC_URL=https://api.yourdomain.com
NEXTAUTH_URL=https://yourdomain.com
MINIO_PUBLIC_URL=https://storage.yourdomain.com
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/auth/google/callback
```

### セキュリティ強化設定

```dotenv
# より強力なシークレットを使用（64文字以上推奨）
JWT_SECRET=$(openssl rand -base64 64)
AUTH_SECRET=$(openssl rand -base64 64)

# 強力なパスワード
POSTGRES_PASSWORD=$(openssl rand -base64 32)
MINIO_SECRET_KEY=$(openssl rand -base64 32)
```

### 外部PostgreSQLサーバーの使用

```dotenv
# 外部DBサーバー（例：AWS RDS、Supabase、Neon）
DATABASE_URL=postgres://user:password@db.example.com:5432/starnion?sslmode=require
```

---

## セキュリティに関する推奨事項

### シークレット管理

- `.env` ファイルをGitにコミットしないこと
  ```bash
  # .gitignoreに以下が含まれていることを確認
  echo ".env" >> .gitignore
  ```
- Gitには `.env.example` のみを含め、実際の値は除外する
- 本番環境では、シークレット管理サービスの利用を検討する（AWS Secrets Manager、Vaultなど）

### ネットワークセキュリティ

- 本番環境では `POSTGRES_PORT` と `MINIO_PORT` を外部に公開しないこと
- NginxまたはCaddyをリバースプロキシとして使用し、HTTPSを強制する
- ファイアウォールで必要なポートのみを許可する：
  - 80（HTTP → HTTPSリダイレクト）
  - 443（HTTPS）
  - その他のポートは内部ネットワークからのみアクセス可能にする

### 定期的なパスワードローテーション

```bash
# 新しいJWTシークレットを生成
NEW_SECRET=$(openssl rand -base64 64)
echo "JWT_SECRET=$NEW_SECRET"

# .envファイルを更新してサービスを再起動
docker compose restart gateway ui
```

---

## 設定変更後のサービス再起動

`.env` ファイルを変更した後は、サービスを再起動する必要があります。

```bash
# 完全な再起動（設定変更を反映）
docker compose down && docker compose up -d

# 特定のサービスのみ再起動
docker compose restart gateway
docker compose restart ui
docker compose restart agent
```

---

## 次のステップ

- [クイックスタート](quickstart) — 設定後に最初の会話を始める
- [インストールガイド](installation) — インストールのトラブルシューティング
- [Starnionとは?](introduction) — 機能とアーキテクチャの理解
