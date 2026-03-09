---
layout: default
title: インストールガイド
nav_order: 3
parent: はじめに
grand_parent: 🇯🇵 日本語
---

# インストールガイド
{: .no_toc }

<details open markdown="block">
  <summary>目次</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## システム要件

### オペレーティングシステム

| OS | バージョン | 備考 |
|----|----------|------|
| macOS | 13 (Ventura) 以降 | Apple Silicon（M1/M2/M3）とIntelの両方に対応 |
| Linux | Ubuntu 22.04 / Debian 11 以降 | amd64とarm64アーキテクチャに対応 |
| Windows | WSL2経由 | Windows 11を推奨 |

### ハードウェア（推奨）

| スペック | 最低 | 推奨 |
|---------|------|------|
| CPU | 2コア | 4コア以上 |
| RAM | 4 GB | 8 GB以上 |
| ディスク | 20 GB | 50 GB以上（データ増加を考慮） |
| ネットワーク | インターネット接続 | AI APIコールに必要 |

### ソフトウェア要件

#### Dockerで実行（推奨）

| ソフトウェア | 最低バージョン | インストールリンク |
|------------|--------------|-----------------|
| Docker Engine | 24+ | [docs.docker.com](https://docs.docker.com/engine/install/) |
| Docker Compose | v2 | Docker Engineに含まれる |
| Git | 2.x | システムのパッケージマネージャーからインストール |

#### ネイティブ実行（開発用）

| ソフトウェア | 最低バージョン | インストールリンク |
|------------|--------------|-----------------|
| Go | 1.22+ | [go.dev](https://go.dev/dl/) |
| Python | 3.13+ | [python.org](https://www.python.org/downloads/) |
| uv | latest | [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| Node.js | 22+ | [nodejs.org](https://nodejs.org/) |
| pnpm | latest | [pnpm.io](https://pnpm.io/installation) |
| PostgreSQL | 16+（pgvector付き） | [pgvector/pgvector](https://github.com/pgvector/pgvector) |
| MinIO | latest | [min.io](https://min.io/download) |

---

## インストール方法1：CLIインストール（推奨）

Starnion CLIを先にインストールすると、初期セットアップ、サービス管理、アップデートがより便利になります。

### クイックインストール（スクリプト）

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

インストールスクリプトは以下を自動的に実行します。
1. オペレーティングシステムとアーキテクチャを検出
2. [GitHub Releases](https://github.com/jikime/starnion/releases)から最新バイナリをダウンロード
3. SHA-256チェックサムを検証
4. `/usr/local/bin` または `~/.local/bin` にインストール

### 特定バージョンのインストール

```bash
STARNION_VERSION=1.2.0 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### ユーザーディレクトリへのインストール

```bash
STARNION_DIR=~/.local/bin curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### CI / 自動化環境（非対話式）

```bash
NO_PROMPT=1 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### インストールの確認

```bash
starnion version
# ★ StarNion v1.x.x
```

---

## インストール方法2：手動バイナリインストール

スクリプトを使わずにバイナリを直接ダウンロードする場合：

### プラットフォームに合ったファイルをダウンロード

[GitHub Releasesページ](https://github.com/jikime/starnion/releases/latest)から対応するファイルをダウンロードしてください。

| プラットフォーム | ファイル名 |
|--------------|----------|
| macOS Apple Silicon（M1/M2/M3） | `starnion_darwin_arm64.tar.gz` |
| macOS Intel | `starnion_darwin_amd64.tar.gz` |
| Linux x86-64 | `starnion_linux_amd64.tar.gz` |
| Linux ARM64 | `starnion_linux_arm64.tar.gz` |

### チェックサムの確認

```bash
# チェックサムファイルのダウンロード
curl -fsSL https://github.com/jikime/starnion/releases/latest/download/checksums.txt -o checksums.txt

# 確認（macOS）
shasum -a 256 --check --ignore-missing checksums.txt

# 確認（Linux）
sha256sum --check --ignore-missing checksums.txt
```

### 展開とインストール

```bash
# macOS Apple Siliconの例
tar -xzf starnion_darwin_arm64.tar.gz
chmod +x starnion
sudo mv starnion /usr/local/bin/

# インストールの確認
starnion version
```

---

## インストール方法3：ソースからビルド

Go 1.22+ と `make` が必要です。

```bash
git clone https://github.com/jikime/starnion.git
cd starnion/gateway
make starnion
# バイナリは ../starnion に作成されます
sudo mv ../starnion /usr/local/bin/
```

---

## CLIインストール後：サービスの起動

CLIをインストールしたら、以下の手順でサービスを起動します。

### Dockerで実行

```bash
# 1. リポジトリをクローン
git clone https://github.com/jikime/starnion.git
cd starnion/docker

# 2. 環境ファイルをコピー
cp .env.example .env

# 3. .envファイルのシークレット値を変更（必須！）
# POSTGRES_PASSWORD, MINIO_SECRET_KEY, JWT_SECRET, AUTH_SECRET

# 4. 初期セットアップウィザード
starnion setup

# 5. サービスの起動
starnion docker up --build
```

### ネイティブ実行（開発者向け）

PostgreSQLとMinIOがすでにローカルで動作している場合：

```bash
# 1. Dockerでインフラサービスのみ起動
cd docker
docker compose up -d postgres minio

# 2. セットアップウィザードを実行
starnion setup

# 3. 全サービスをネイティブで実行（gateway + agent + UI）
starnion dev
```

または個別サービスを実行：

```bash
starnion gateway   # Go APIサーバー       :8080
starnion agent     # Python AIエンジン    :50051
starnion ui        # Next.jsインターフェース   :3000
```

---

## インストールの確認

### 基本ヘルスチェック

```bash
# CLIバージョンの確認
starnion version

# システム状態の診断
starnion doctor
```

`starnion doctor` の期待される出力：

```
✓ PostgreSQL connection verified
✓ MinIO connection verified
✓ Gateway response verified
✓ Agent gRPC connection verified
```

### Web UIアクセスの確認

ブラウザで以下のアドレスにアクセスします。

```
http://localhost:3000
```

ログインページが表示されれば、インストール完了です。

### サービスごとのヘルスチェック

```bash
# Gateway APIヘルスチェック
curl http://localhost:8080/health
# {"status":"ok"}

# MinIOヘルスチェック
curl http://localhost:9000/minio/health/live
# 200 OK

# PostgreSQL接続確認（Docker環境）
docker exec starnion-postgres pg_isready -U starnion
# /var/run/postgresql:5432 - accepting connections
```

---

## アップデート

```bash
# 最新バージョンにアップデート
starnion update

# 特定バージョンにアップデート
starnion update --version 1.2.0
```

---

## アンインストール

### CLIの削除

```bash
rm $(which starnion)
rm -rf ~/.config/starnion   # 設定ファイルの削除（オプション）
```

### Dockerサービスとデータの削除

```bash
cd starnion/docker

# サービスのみ停止（データを保持）
docker compose down

# サービス + ボリューム（データ）を削除
docker compose down -v

# イメージを含めすべて削除
docker compose down -v --rmi all
```

> **警告：** `docker compose down -v` コマンドは、PostgreSQLデータベースとMinIOファイルを含む**すべてのデータを完全に削除**します。事前に重要なデータをバックアップしてください。

---

## トラブルシューティング

### Dockerパーミッションエラー

```
permission denied while trying to connect to the Docker daemon socket
```

解決策：

```bash
# 現在のユーザーをdockerグループに追加
sudo usermod -aG docker $USER

# ログアウトして再ログイン、または：
newgrp docker
```

### ポートの競合

```
Error: bind: address already in use
```

解決策：

```bash
# どのプロセスがポートを使用しているか確認
lsof -i :5432   # PostgreSQL
lsof -i :9000   # MinIO
lsof -i :8080   # Gateway
lsof -i :3000   # UI

# .envでポートを変更
POSTGRES_PORT=5433
MINIO_PORT=9001
GATEWAY_PORT=8081
UI_PORT=3001
```

### イメージビルドの失敗

```bash
# Dockerキャッシュをクリアして再ビルド
docker compose build --no-cache
docker compose up -d
```

### Agentが起動しない

```bash
# Agentのログを確認
docker compose logs agent

# Pythonの依存関係の問題の場合、イメージを再ビルド
docker compose build --no-cache agent
docker compose up -d agent
```

### PostgreSQL接続の失敗

```bash
# PostgreSQLコンテナの状態を確認
docker compose ps postgres
docker compose logs postgres

# PostgreSQLがhealthyになるまで待ってから再試行
docker compose restart gateway agent
```

### 「pgvector extension not found」エラー

```bash
# pgvectorイメージを使用しているか確認
# docker-compose.ymlで：
# image: pgvector/pgvector:pg16  ← これが正しい
# image: postgres:16             ← これはpgvectorを含まない

# 正しいイメージで再起動
docker compose down -v
docker compose up -d
```

### macOSでのApple Siliconの問題

```bash
# プラットフォームを明示的に指定
docker compose --platform linux/arm64 up -d
```

### MinIOにアクセスできない

MinIOコンソール（`http://localhost:9001`）に到達できない場合：

```bash
# MinIOコンテナの状態を確認
docker compose logs minio

# .envのMINIO_CONSOLE_PORTを確認
echo $MINIO_CONSOLE_PORT
```

---

## 次のステップ

インストールが完了したら：

- [設定](configuration) — AI APIキーと環境変数の設定
- [クイックスタート](quickstart) — 最初の会話を始める
