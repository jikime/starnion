---
title: CLIチャット & 認証
nav_order: 12
parent: 機能ガイド
grand_parent: 🇯🇵 日本語
---

# CLIチャット & 認証

## 概要

Web UIとTelegramに加えて、Starnionでは**ターミナル（CLI）**から直接AIとチャットできます。SSH経由でサーバーに接続している場合や、ブラウザを開かずに素早くAIに問い合わせたい場合に特に便利です。

CLIでの会話は、Web UIやTelegramのチャットと**同じデータベース**に保存されます。ターミナルで始めた会話を、後からWeb UIで確認できます。

---

## インストールの確認

CLI機能は `starnion` バイナリに組み込まれています。以下のコマンドでインストールを確認してください。

```bash
starnion --version
```

インストールされていない場合は、[インストールガイド](/docs/ja/getting-started/introduction)を参照してください。

---

## 認証

### ログイン

`starnion login` でメールアドレスとパスワードを使ってサインインします。成功すると、認証トークンが `~/.starnion/user.yaml` に保存されます。

```bash
starnion login
```

```
Email:    user@example.com
Password: ••••••••
Login successful! Welcome, Jane Doe.
Token valid until: April 9, 2025 (30 days)
```

**トークン保存場所:** `~/.starnion/user.yaml`

```yaml
# ~/.starnion/user.yaml
token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
expires_at: "2025-04-09T00:00:00Z"
email: user@example.com
name: Jane Doe
```

> **トークンは30日間有効です。** 有効期限の7日前から、CLIコマンドを実行するたびに更新リマインダーが表示されます。

---

### ログアウト

`starnion logout` はローカルに保存されたトークンを削除します。サーバー側のセッションには影響しません。CLIを使用するには再度ログインが必要です。

```bash
starnion logout
```

```
Logged out. Local credentials have been removed.
```

---

### 現在のログイン確認

`starnion whoami` で現在認証されているアカウントの情報を表示します。

```bash
starnion whoami
```

```
Name:    Jane Doe
Email:   user@example.com
Token expires: April 9, 2025 (in 23 days)
```

ログインしていない場合：

```
Not logged in. Run 'starnion login' to authenticate.
```

---

## CLIチャット

### インタラクティブREPLモードの開始

`starnion chat` を実行すると、インタラクティブREPL（Read-Eval-Print Loop）モードに入ります。プロンプトにメッセージを入力すると、AIがリアルタイムで応答します。

```bash
starnion chat
```

```
Starnion CLI Chat Mode
Starting a new conversation. Type 'exit' or press Ctrl+C to quit.

> Hello! What's the weather like today?
AI: Let me check the current weather for you.
    Running weather...
    Current weather in Seoul: Clear, 18 C.
    Air quality is moderate.

> Summarize my spending this month.
AI: Running finance_summary...
    March spending (1st-10th):
    - Food:        $31.50
    - Cafe:        $13.30
    - Transport:   $11.40
    - Total:       $56.20

> exit
Exiting. Your conversation has been saved.
```

### セッションの終了

REPLモードを終了するには、以下のいずれかを使用します：

- `exit` または `quit` と入力
- `Ctrl+C` を押す

終了時に現在の会話は自動的に保存されます。

---

## Web UIとの統合

CLIで開始した会話は**Web UIのサイドバーに表示されます**。CLI会話は `platform='cli'` で保存され、サイドバーの **CLI** セクションに、WebやTelegramの会話とは別に表示されます。

```
サイドバーの会話リスト：
  Telegram
    └─ 今日の天気について質問
  CLI
    └─ 3月10日の支出まとめ  <-- CLIで開始
  Web
    └─ 契約書分析リクエスト
```

> Web UIでCLI会話を選択すると、そのスレッドの完全なメッセージコンテキストが復元されます。

---

## トークン有効期限の警告

認証トークンは**30日間**有効です。**有効期限の7日前**から、CLIコマンドを実行するたびにリマインダーが表示されます。

```bash
starnion chat
```

```
Your token expires in 5 days. Run 'starnion login' to renew it.

Starnion CLI Chat Mode
> ...
```

トークンが期限切れになると、すべてのCLIコマンドで再ログインが求められます。

```bash
starnion whoami
```

```
Your token has expired. Run 'starnion login' to sign in again.
```

---

## マルチユーザーサポート

CLIは**OSユーザーごとに独立した認証**をサポートしています。各OSユーザーのホームディレクトリに個別の `~/.starnion/user.yaml` ファイルが作成されるため、同じサーバー上の複数のユーザーがそれぞれ自分のStarnionアカウントを使用できます。

| OSユーザー | トークンファイルパス |
|-----------|-------------------|
| alice | `/home/alice/.starnion/user.yaml` |
| bob | `/home/bob/.starnion/user.yaml` |
| root | `/root/.starnion/user.yaml` |

各ユーザーは自分のトークンを使用して、自分の会話履歴のみにアクセスできます。

---

## コマンドリファレンス

| コマンド | 説明 |
|---------|------|
| `starnion login` | メール/パスワードでサインインし、トークンを `~/.starnion/user.yaml` に保存 |
| `starnion logout` | ローカルトークンを削除 |
| `starnion whoami` | 現在のアカウントとトークン有効期限を表示 |
| `starnion chat` | インタラクティブREPLチャットモードを開始 |

---

## Tips & FAQ

**Q. トークンファイル（`~/.starnion/user.yaml`）を手動で編集できますか？**

A. 推奨しません。トークンはサーバーが署名したJWTです。手動で変更すると認証に失敗します。トークンが期限切れになった場合は、`starnion login` で新しいトークンを取得してください。

**Q. CLIの会話がWeb UIのサイドバーに表示されません。**

A. サイドバーの **CLI** セクションを確認してください。Web UIが既に開いている場合は、ページを更新して会話リストを再読み込みしてください。

**Q. CLIで複数のStarnionアカウントを切り替えられますか？**

A. はい -- `starnion logout` を実行してから、別のアカウントで `starnion login` してください。トークンファイルは新しいアカウントの認証情報で上書きされます。

**Q. CI/CDパイプラインでCLIを使いたいです。**

A. 現在、CLIはインタラクティブログインのみサポートしています。自動化環境向けのAPIキー認証は将来のリリースで予定されています。

**Q. 不安定なネットワーク接続でCLIは動作しますか？**

A. CLIはメッセージごとにAPIコールを行います。ネットワークが切断されると、リクエストは失敗し、リトライなしでエラーメッセージが表示されます。安定したネットワーク接続での使用をお勧めします。

---

## starnion ask -- ワンショット質問

`starnion chat` がインタラクティブセッションであるのに対し、`starnion ask` は**単一の質問を送信して即座に回答を返します**。スクリプトやパイプラインでAI出力を組み込みたい場合に最適です。

### 基本的な使い方

```bash
# 直接質問
starnion ask "Pythonのリスト内包表記の例を教えて"

# パイプでコンテンツを渡す
cat error.log | starnion ask "このエラーの原因は？"
cat report.md | starnion ask "これを3行でまとめて"
```

### 機能

| 機能 | 詳細 |
|------|------|
| ログイン必須 | はい（事前に `starnion login` を実行） |
| 会話履歴 | Web UIに保存 |
| ストリーミング | リアルタイム出力対応 |
| パイプサポート | `cat file \| starnion ask "..."` |

### パイプの例

```bash
# ログファイルの分析
tail -100 /var/log/app.log | starnion ask "最近のエラーパターンを分析して"

# コードレビュー
git diff HEAD~1 | starnion ask "この変更をレビューして"

# ドキュメントの要約
curl -s https://example.com/readme.md | starnion ask "重要なポイントをまとめて"
```
