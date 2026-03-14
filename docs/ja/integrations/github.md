---
title: GitHub連携
nav_order: 3
parent: 連携
grand_parent: 🇯🇵 日本語
---

# GitHub連携

StarnionをGitHubに接続すると、AIエージェントが自然言語でリポジトリ情報、Issue、Pull Requestを照会・管理できるようになります。開発ワークフローを対話形式で管理しましょう。

---

## 概要

GitHub連携を使用すると：

- **リポジトリ**: リポジトリ一覧の表示、最近のコミット確認
- **Issue**: Issue の作成、表示、ステータス確認
- **Pull Request**: PR一覧の表示、レビュー状況の確認、サマリーの取得
- **コード検索**: リポジトリ内のコード検索

> **オプトイン機能：** GitHub連携はデフォルトで無効になっています。Personal Access Tokenを設定し、スキルを有効化する必要があります。

---

## 対応機能一覧

| 機能 | 説明 |
|------|------|
| リポジトリ一覧表示 | ユーザーのリポジトリ一覧を確認 |
| Issue作成 | 新しいIssueを作成 |
| Issue表示 | Issue一覧と詳細内容を確認 |
| PRステータス確認 | Pull Request一覧とレビュー状況を確認 |
| コード検索 | リポジトリ内のコードをキーワード検索 |

---

## 事前準備：GitHub Personal Access Tokenの発行

### ステップ1：トークンの作成

1. [GitHub Settings](https://github.com/settings/tokens)にアクセスします。
2. **Generate new token** → **Generate new token (classic)** をクリック。
3. **Note** フィールドにトークン名を入力します（例：`Starnion`）。
4. **Expiration** で有効期限を選択します。
5. 以下のスコープ（権限）を選択します：

   | スコープ | 目的 |
   |----------|------|
   | `repo` | リポジトリの読み書き（プライベート含む） |
   | `read:org` | 組織情報の読み取り |

6. **Generate token** をクリックし、トークンをコピーします（`ghp_...` 形式）。

> **セキュリティ注意：** トークンは作成直後のみ全体を確認できます。すぐにコピーしてください。

---

## 設定方法

### Web UIでトークンを登録

1. Starnion Web UIにログインします。
2. 左メニュー → **Settings** → **Integrations** タブをクリック。
3. **GitHub** セクションの **Personal Access Token** 入力フィールドを見つけます。
4. コピーしたトークン（`ghp_...`）を貼り付けます。
5. **保存** ボタンをクリック。
6. **GitHubスキル有効化** トグルをオンにします。

---

## 使用方法

GitHub連携が設定されたら、AIに自然言語でリクエストします。

### リポジトリの表示

```
自分：GitHubのリポジトリ一覧を見せて
ボット：GitHubリポジトリ一覧：
       - starnion/starnion (Private) ⭐ 12
       - starnion/docs (Public) ⭐ 5
       - starnion/agent (Private) ⭐ 3
```

### Issue管理

```
自分：starnionリポジトリのオープンIssueを見せて
ボット：starnion/starnion オープンIssue（3件）：
       - #42: ログインエラーの修正が必要 (bug)
       - #38: 多言語サポートの追加 (enhancement)
       - #35: APIドキュメントの更新 (documentation)

自分：starnionリポジトリに「検索機能の改善」というIssueを作って
ボット：Issueを作成しました。
       #43: 検索機能の改善
       URL: https://github.com/starnion/starnion/issues/43
```

### Pull Requestの確認

```
自分：starnionリポジトリの最近のPR状況を教えて
ボット：starnion/starnion PR一覧：
       - #41: feat: 検索フィルターの追加 (Open, レビュー待ち)
       - #39: fix: メモリリークの解決 (Merged)
```

---

## 必要な権限（スコープ）

| スコープ | 目的 |
|----------|------|
| `repo` | リポジトリの読み書き（プライベート含む） |
| `read:org` | 組織情報の読み取り |

---

## 接続解除方法

1. Settings → Integrations → GitHub セクション。
2. **接続解除** ボタンをクリック。
3. 保存されたPersonal Access Tokenが即座に削除されます。

---

## トラブルシューティング

### 「GitHub連携が設定されていません」

Settings → Integrations → GitHub でPersonal Access Tokenが登録されているか確認してください。

### 「GitHub API認証に失敗しました」（401エラー）

- トークンが期限切れの可能性があります。GitHubで新しいトークンを発行してください。
- トークンのスコープ（権限）が十分か確認してください。

### 「リポジトリが見つかりません」（404エラー）

- トークンに `repo` スコープがあるか確認します。
- プライベートリポジトリには `repo` スコープが必須です。

---

## FAQ

**Q: 組織（Organization）リポジトリにもアクセスできますか？**
A: はい、トークンに `repo` と `read:org` スコープがあれば、組織リポジトリにもアクセスできます。

**Q: GitHub Enterpriseでも使えますか？**
A: 現在はgithub.comのみサポートしています。GitHub Enterpriseのサポートは今後追加予定です。

**Q: トークンが期限切れになったらどうなりますか？**
A: APIリクエスト時に認証エラーが発生します。GitHubで新しいトークンを発行し、Settingsで更新してください。
