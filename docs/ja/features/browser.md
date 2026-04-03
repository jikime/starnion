---
title: ブラウザ操作
nav_order: 18
parent: 機能
grand_parent: 🇯🇵 日本語
---

# ブラウザ操作

## 概要

Starnion のブラウザ操作機能は、AI が実際の Chrome ブラウザを自動的に操作できるようにします。URL ナビゲーション、ボタンクリック、テキスト入力、フォート自動入力、ページスクリーンショットの撮影など、自然言語の一言で実行できます。

Chrome DevTools MCP をベースに動作し、**Chrome さえあれば別途インストール不要で**すぐに使用できます。エージェントが Chrome を自動的に起動・管理します。

スクリーンショットは自動的にクラウド（MinIO）にアップロードされ、チャットに画像として添付されると同時に、**画像メニューにも自動保存**されます。Telegram・Web チャットのどちらからでもすぐに確認できます。

---

## 有効化方法

ブラウザ機能はデフォルトで有効になっています。Chrome ブラウザがインストールされた環境で自動的に起動します。

**`~/.starnion/starnion.yaml` の設定：**

```yaml
browser:
  enabled: true              # ブラウザ機能のオン/オフ
  headless: false            # false: ブラウザウィンドウを表示（デフォルト）、true: バックグラウンド実行
  control_port: 18793        # ブラウザコントロールサーバーのポート（デフォルト値）
  # url: http://127.0.0.1:9222  # 既に実行中の Chrome に接続する場合のみ設定
```

**環境変数：**

```bash
BROWSER_ENABLED=false          # ブラウザ機能を無効化
BROWSER_HEADLESS=true          # headless を強制
BROWSER_CONTROL_PORT=18793     # ポートを変更
BROWSER_URL=http://127.0.0.1:9222  # 既存の Chrome にリモート接続
```

---

## Headless / Headed モード

| モード | 説明 | 用途 |
|--------|------|------|
| **Headed**（デフォルト） | ブラウザウィンドウが画面に表示 | デスクトップ環境、ローカル開発 |
| **Headless** | ウィンドウなしでバックグラウンド実行 | サーバー環境、Docker、CI |

```bash
# headless を強制（環境変数が優先）
BROWSER_HEADLESS=true

# starnion.yaml で設定
browser:
  headless: true
```

---

## 使用例

### スクリーンショットの撮影

```
ユーザー：Yahoo! Japan で今日の東京の天気を調べて
ボット：[ブラウザを操作中...]
       ![スクリーンショット](http://localhost:8080/api/files/browser/screenshots/uuid.png)
       東京の現在の天気のスクリーンショットです。

ユーザー：https://maps.google.com をキャプチャして
ボット：[ブラウザを操作中...]
       ![スクリーンショット](http://localhost:8080/api/files/browser/screenshots/uuid.png)
       Google マップのスクリーンショットです。
```

> スクリーンショットは**画像メニュー**に自動保存されます。

### 経路検索とキャプチャ

```
ユーザー：Google マップで渋谷から新宿までの経路を検索して画面をキャプチャして
ボット：Google マップに移動して経路を検索します！
       [ルート検索ボタンをクリック → 出発地/到着地を入力 → 候補を選択...]
       ![経路スクリーンショット](http://localhost:8080/api/files/browser/screenshots/uuid.png)
       渋谷 → 新宿の経路検索結果です。所要時間約 15 分の見込みです。
```

### Web ページのナビゲーションとクリック

```
ユーザー：Google の検索ボックスに「天気」と入力して検索して
ボット：Google に移動し、検索ボックスに「天気」を入力して Enter を押しました。
       ![検索結果](http://localhost:8080/api/files/browser/screenshots/uuid.png)
```

### フォーム入力

```
ユーザー：ログインページのメールアドレス入力欄に test@example.com と入力して
ボット：メールアドレス入力欄を見つけ、test@example.com を入力しました。
```

---

## 仕組み

```
ユーザーのリクエスト
    ↓
エージェント（Claude）が starnion-browser.py コマンドを実行
    ↓
ブラウザコントロールサーバー（127.0.0.1:18793）→ Chrome DevTools MCP
    ↓
Chrome ブラウザの実際の操作（クリック、入力、キャプチャなど）
    ↓
スクリーンショット：MinIO にアップロード → URL 生成
    ↓
エージェントが Markdown 画像として応答：![alt](url)
    ↓
ゲートウェイ：Telegram に画像を送信 + 画像メニューに保存
```

---

## 対応コマンド

AI が自動的に選択しますが、特定の操作を指示する際の参考にできます。

| コマンド | 説明 | リクエスト例 |
|----------|------|-------------|
| `snapshot` | ページの AI スナップショット（クリック可能な要素を特定） | 「今のページ構造を教えて」 |
| `navigate` | URL に移動 | 「Google を開いて」 |
| `screenshot` | 現在のページをスクリーンショット | 「今の画面を撮って」 |
| `click` | 要素をクリック | 「確認ボタンをクリックして」 |
| `fill` | 入力欄にテキストを入力 | 「検索ボックスに天気と入力して」 |
| `fill_form` | 複数の入力欄を一度に入力 | 「メールアドレスとパスワードを入力して」 |
| `press` | キーを押す | 「Enter を押して」 |
| `hover` | 要素にマウスを乗せる | 「メニューにマウスを乗せて」 |
| `wait` | 特定のテキストが表示されるまで待機 | （自動使用） |
| `tabs` | 開いているタブの一覧を表示 | 「開いているタブを見せて」 |
| `open` | 新しいタブを開く | 「新しいタブで Yahoo を開いて」 |

---

## 検索 URL パターン

ホームページで検索ボックスをクリックするより、直接検索 URL を使う方が速く確実です。

| 検索エンジン | URL パターン |
|-------------|-------------|
| Yahoo! Japan | `https://search.yahoo.co.jp/search?p=キーワード` |
| Google | `https://www.google.com/search?q=キーワード` |
| Bing | `https://www.bing.com/search?q=キーワード` |
| YouTube | `https://www.youtube.com/results?search_query=キーワード` |

---

## オートコンプリートの処理

検索ボックスやアドレス入力など、オートコンプリートがある入力欄は、必ず以下の手順で処理します。

```
1. fill でテキストを入力
   ↓
2. snapshot でオートコンプリートリストを確認
   ↓
3. オートコンプリート項目の ref を見つけ、click で選択
   ↓
4. 次のステップへ進む
```

> **注意：** オートコンプリートの項目は Enter キーではなく、必ずクリックで選択してください。

---

## 画像の保存

スクリーンショットは自動的に処理されます。

```
スクリーンショットを撮影
    ↓
MinIO（browser/screenshots/）に PNG をアップロード
    ↓
URL 生成：/api/files/browser/screenshots/uuid.png
    ↓
エージェントの応答に Markdown 画像として含める：![スクリーンショット](url)
    ↓
画像メニューに自動保存（source: browser, type: screenshot）
```

---

## 設定リファレンス

```yaml
# ~/.starnion/starnion.yaml
browser:
  enabled: true
  control_port: 18793        # ブラウザコントロールサーバーのポート
  headless: false            # true: バックグラウンド、false: ウィンドウ表示
  evaluate_enabled: false    # JavaScript 実行を許可（セキュリティ上デフォルト false）
  # url: http://127.0.0.1:9222  # 実行中の Chrome に直接接続
```

---

## よくある質問

**Q. Chrome は自動的に起動しますか？**
はい。エージェントが Chrome DevTools MCP を通じて Chrome を自動的に起動・管理します。別途インストールや設定は不要で、Chrome さえあれば使用できます。

**Q. 既に開いている Chrome ウィンドウを使用できますか？**
できます。Chrome を `--remote-debugging-port=9222` オプションで起動した後、`starnion.yaml` で `browser.url: http://127.0.0.1:9222` を設定してください。

**Q. スクリーンショットが画像メニューに表示されない場合は？**
エージェントが応答に `![スクリーンショット](url)` 形式で URL を含める必要があります。保存されない場合は「スクリーンショットを Markdown 画像として応答に含めてください」とリクエストしてみてください。

**Q. ログインが必要なサイトも操作できますか？**
できます。「メールアドレスの入力欄に user@example.com と入力して」「パスワード欄に入力して」のようにリクエストしてください。ただし、パスワードはチャット履歴に残るためご注意ください。

**Q. 地図のスクリーンショットが白い画面になってしまう場合は？**
地図タイルが読み込まれる前に撮影されてしまうケースです。「5 秒待ってからスクリーンショットを撮って」のようにリクエストしてみてください。

**Q. アンチボット対策でブロックされた場合は？**
一部のサイトは自動化アクセスをブロックします。この場合は `snapshot` でページのテキストを抽出して内容を要約する方法で対応できます。

**Q. Docker 環境で headed モードを使用するには？**
Docker コンテナ内で headed モードを使用するには仮想ディスプレイ（Xvfb）が必要です。Docker 環境では headless モードの使用を推奨します。
