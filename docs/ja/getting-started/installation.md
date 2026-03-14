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

#### ネイティブ実行（開発用）

| ソフトウェア | 最低バージョン | インストールリンク |
|------------|--------------|-----------------|
| Go | 1.22+ | [go.dev](https://go.dev/dl/) |
| Python | 3.13+ | [python.org](https://www.python.org/downloads/) |
| uv | latest | [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| Node.js | 18.12+（推奨：22 LTS） | [nodejs.org](https://nodejs.org/) |
| pnpm | latest | [pnpm.io](https://pnpm.io/installation) |
| PostgreSQL | 16+（pgvector付き） | [pgvector/pgvector](https://github.com/pgvector/pgvector) |
| MinIO | latest | [min.io](https://min.io/download) |

#### Node.jsのインストール方法

`starnion dev` または `starnion ui` コマンドを使用する際にNode.jsが必要です。（pnpmは見つからない場合、自動的にインストールされます。）

**Ubuntu / Debian**

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
```

**RHEL / Rocky Linux / CentOS**

```bash
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
```

**macOS (Homebrew)**

```bash
brew install node@22
```

**macOS / Linux (nvm — バージョン管理に推奨)**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# ターミナルを再起動後：
nvm install 22
nvm use 22
```

インストール確認：

```bash
node --version   # v22.x.x
```

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

## CLIインストール後：サービスの実行

### Dockerで実行（推奨）

v1.0.2以降、`git clone`なしでCLIのみでDockerを実行できます。

```bash
# 1. 初期設定ウィザード（DB、MinIO、APIキーなど）
starnion setup

# 2. Dockerサービス起動（イメージビルド含む）
starnion docker up --build

# 3. 以降の起動
starnion docker up -d
```

#### プロダクションモード

```bash
# リソース制限、ログローテーション、ポート制限が適用されます
starnion docker up --prod -d
```

#### 主なDockerコマンド

```bash
starnion docker up -d          # バックグラウンド起動
starnion docker down           # サービス停止
starnion docker logs -f        # リアルタイムログ
starnion docker ps             # コンテナ状態確認
starnion docker restart        # 全体再起動
starnion docker migrate        # DBマイグレーション単体実行
starnion docker backup         # DB+ファイルバックアップ
starnion docker restore --from <パス>  # バックアップから復元
```

### ネイティブで実行（開発者向け）

PostgreSQLとMinIOがすでにローカルで実行されている場合：

```bash
# 1. インフラサービスのみDockerで起動
starnion docker up -d postgres minio

# 2. セットアップウィザード
starnion setup

# 3. 全サービスをネイティブ実行（ゲートウェイ + エージェント + UI）
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
http://localhost:3893
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
# 最新バージョンに更新（CLI + Dockerイメージ + DBマイグレーション自動実行）
starnion update

# バージョン確認のみ
starnion update --check

# CLIのみ更新（Dockerイメージ更新をスキップ）
starnion update --skip-docker
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
