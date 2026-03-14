---
title: モデル設定
nav_order: 1
parent: 設定
grand_parent: 🇯🇵 日本語
---

# モデル設定

## 概要

モデル設定は、Starnion で使用する AI モデルとプロバイダーを構成するページです。各種 LLM プロバイダーの API キーを登録し、チャット・画像生成・埋め込みなど用途に応じた最適なモデルを指定できます。

**主な機能:**
- 複数の LLM プロバイダーに対応: Google Gemini、OpenAI、Anthropic Claude、GLM/Z.AI、Ollama
- API キー管理: プロバイダーごとの API キー登録・検証
- 用途別モデル割り当て: チャット・画像生成・埋め込みなど機能ごとにモデルを指定
- 詳細パラメーター設定: temperature、max_tokens などの細かい調整
- カスタムエンドポイント: OpenAI 互換 API のサポート (Ollama、vLLM など)

---

## 対応プロバイダー

| プロバイダー | 主なモデル | 特徴 |
|------------|----------|------|
| **Google Gemini** | Gemini 2.0 Flash、Gemini 1.5 Pro | 無料枠あり、長いコンテキスト |
| **OpenAI** | GPT-4o、GPT-4o-mini | 汎用性が高く多様なモデル |
| **Anthropic** | Claude 3.5 Sonnet、Claude 3 Haiku | 安全な AI、長いコンテキスト |
| **GLM/Z.AI** | GLM-4 | 高性能推論モデル |
| **Ollama** | Llama 3、Mistral など | ローカル実行、無料 |
| **カスタム** | (ユーザー定義) | OpenAI 互換エンドポイント |

---

## API キーの登録

1. **設定 > モデル** に移動します。
2. 使用するプロバイダーを選択します。
3. **API キー**を入力します。
4. **保存**をクリックします。

保存時にバックエンドで API キーの有効性が自動検証されます。

> API キーは暗号化して保存されます。画面には先頭 4 文字と末尾 4 文字のみ表示されます。

### プロバイダー別 API キーの取得

#### Google Gemini

1. [Google AI Studio](https://aistudio.google.com/) にアクセス
2. **Get API key** → **Create API key** をクリック
3. 生成されたキーをコピー (`AIza...` 形式)

**無料枠:** 1 分あたり 15 回、1 日 1,500 回 (2025 年時点)

#### OpenAI

1. [OpenAI Platform](https://platform.openai.com/) にログイン
2. 右上のプロフィール → **API keys** → **Create new secret key**
3. キーをコピー (`sk-proj-...` 形式)

#### Anthropic

1. [Anthropic Console](https://console.anthropic.com/) にログイン
2. 左メニューの **API Keys** → **Create Key**
3. キーをコピー (`sk-ant-...` 形式)

---

## モデルの割り当て

機能ごとに異なるモデルを割り当てて、コストとパフォーマンスを最適化できます。

| 機能 | 推奨モデル |
|------|----------|
| **チャット** | Gemini 2.0 Flash、GPT-4o-mini |
| **レポート** | GPT-4o、Claude 3.5 Sonnet |
| **画像生成** | DALL-E 3 |
| **埋め込み** | text-embedding-3-small、gemini-embedding-001 |

---

## 詳細パラメーター

| パラメーター | 説明 | デフォルト |
|------------|------|---------|
| **temperature** | 回答の創造性/ランダム性 (0.0〜2.0) | 0.7 |
| **max_tokens** | 回答の最大トークン数 | 4096 |
| **top_p** | 累積確率サンプリング (0.0〜1.0) | 1.0 |

---

## よくある質問

**Q. 複数のプロバイダーに API キーを登録できますか?**
はい。複数プロバイダーの API キーを同時に登録し、機能ごとに異なるモデルを割り当てられます。

**Q. Ollama で完全無料で使えますか?**
はい。Ollama をローカルにインストールしてカスタムエンドポイントで接続すれば、外部 API コストなしで使えます。

**Q. モデルを変更すると既存の会話に影響しますか?**
いいえ。モデル変更は以降の新しい会話から適用されます。既存の会話履歴はそのまま保持されます。
