---
layout: default
title: クイックスタート（3ステップ）
nav_order: 2
parent: はじめに
grand_parent: 🇯🇵 日本語
---

# クイックスタート（3ステップ）
{: .no_toc }

CLIだけで、3ステップでStarnionを起動できます。
{: .fs-6 .fw-300 }

<details open markdown="block">
  <summary>目次</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 前提条件

開始前に、以下の2つだけインストールされていれば問題ありません。

| 要件 | 最低バージョン | 確認方法 |
|------|--------------|---------|
| Docker Engine | 24+ | `docker --version` |
| Docker Compose | v2 | `docker compose version` |

> **Docker Desktopをご利用の場合**、Docker EngineとDocker Composeはすでに含まれています。

### インストールの確認

```bash
docker --version
# Docker version 24.0.0, build ...

docker compose version
# Docker Compose version v2.x.x
```

---

## 3ステップクイックスタート

### ステップ1: CLIのインストール

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

インストールスクリプトが自動的に以下を実行します：
- `starnion` CLI → `/usr/local/bin/starnion`
- `starnion-gateway` → `~/.starnion/bin/`
- Python agent → `~/.starnion/agent/`
- Next.js UI → `~/.starnion/ui/`
- Docker設定ファイル → `~/.starnion/docker/`

### ステップ2: 初期セットアップウィザード

```bash
starnion setup
```

セットアップウィザードは以下のステップを順番にガイドします。

| ステップ | 設定項目 |
|---------|---------|
| 1 | システム接続の確認（PostgreSQL、MinIO） |
| 2 | データベース接続とマイグレーションの実行 |
| 3 | 管理者アカウントの作成（メール + パスワード） |
| 4 | ファイルストレージの設定（MinIOバケット） |
| 5 | サービスURLの設定 |

### ステップ3: サービスの起動

```bash
starnion docker up --build
```

初回実行時はDockerイメージのビルドに数分かかります。2回目以降はすぐに起動します。

進行状況の確認：

```bash
starnion docker logs -f
```

すべてのサービスが `healthy` 状態になれば準備完了です。

```bash
starnion docker ps
```

期待される出力：

```
NAME                 STATUS
starnion-postgres    Up (healthy)
starnion-minio       Up (healthy)
starnion-agent       Up (healthy)
starnion-gateway     Up
starnion-ui          Up
```

---

## 最初の会話

ログイン後、以下をお試しください。

### 基本的な会話

チャット入力欄にメッセージを入力します。

```
こんにちは！自己紹介をしてください。
```

### AIプロバイダーの設定

より良いレスポンスのためにAI APIキーを設定します。

1. 右上のユーザーメニュー → **設定**
2. **AIプロバイダー** タブを選択
3. Google Gemini、OpenAI、またはAnthropicのAPIキーを入力

> **無料で始める：** Google AI StudioからGemini APIキーを無料で取得できます。
> 👉 [https://aistudio.google.com](https://aistudio.google.com)

### スキルを試す

組み込みスキルをテストしてみましょう。

```
今日の東京の天気を教えてください。
```

```
「Hello, World!」をフランス語に翻訳してください。
```

```
1 + 1 は何ですか？
```

---

## クイックリファレンスコマンド

```bash
# サービスの起動
starnion docker up -d

# サービスの停止
starnion docker down

# ログの確認（リアルタイム）
starnion docker logs -f

# 特定サービスのログ
starnion docker logs -f gateway
starnion docker logs -f agent

# サービス状態の確認
starnion docker ps

# 全サービスの再起動
starnion docker restart

# イメージを再ビルドして起動
starnion docker up --build

# 最新バージョンに更新
starnion update

# バックアップ / 復元
starnion docker backup
starnion docker restore --from ~/.starnion/backups/<timestamp>
```

---

## 問題が発生した場合

### ポートがすでに使用中

```bash
# どのプロセスがポートを使用しているか確認
lsof -i :3000
lsof -i :8080
lsof -i :5432
```

`.env` ファイルでポートを変更できます。

```dotenv
GATEWAY_PORT=8081
UI_PORT=3001
POSTGRES_PORT=5433
```

### サービスが起動しない

```bash
# エラーログを確認
docker compose logs gateway
docker compose logs agent

# すべて停止して再起動
docker compose down && docker compose up -d
```

### さらにサポートが必要な場合

- [インストールガイド](installation) — より詳細なインストール手順
- [設定](configuration) — 環境変数の全説明
- [GitHub Issues](https://github.com/jikime/starnion/issues) — バグ報告と質問

---

## 次のステップ

クイックスタートが完了したら、以下をご確認ください。

- [設定](configuration) — AI APIキーの設定、Telegramボットの連携
- [インストールガイド](installation) — CLIのインストールとネイティブ実行
- [Starnionとは?](introduction) — 詳細なアーキテクチャと機能の説明
