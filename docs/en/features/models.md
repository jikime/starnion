---
title: Model Settings
nav_order: 16
parent: Features
grand_parent: 🇺🇸 English
---

# Model Settings

## Overview

Model Settings is the configuration page for managing AI models and providers in Starnion. Register API keys from various LLM providers and assign optimal models for different purposes such as chat, image generation, and embeddings.

**Key Features:**
- Multiple LLM providers: Google Gemini, OpenAI, Anthropic Claude, GLM/Z.AI, Ollama
- API key management: Register and validate provider-specific API keys
- Per-function model assignment: Assign different models for chat, image generation, embeddings, etc.
- Advanced parameters: Fine-tune temperature, max_tokens, and more
- Custom endpoints: Support for OpenAI-compatible APIs (Ollama, vLLM, etc.)

---

## Supported Providers

| Provider | Key Models | Features |
|----------|-----------|---------|
| **Google Gemini** | Gemini 2.0 Flash, Gemini 1.5 Pro | Free tier, long context |
| **OpenAI** | GPT-4o, GPT-4o-mini | Strong general-purpose, broad model selection |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Haiku | Safe AI, long context |
| **GLM/Z.AI** | GLM-4 | High-performance reasoning |
| **Ollama** | Llama 3, Mistral, etc. | Local execution, free |
| **Custom** | (User-defined) | OpenAI-compatible endpoint |

---

## Registering API Keys

1. Navigate to **Features > Model Settings**.
2. Select the provider you want to use.
3. Enter the **API Key**.
4. Click **Save**.

The backend automatically validates the API key upon saving.

> API keys are stored encrypted. Only the first 4 and last 4 characters are shown on screen.

### Getting API Keys per Provider

#### Google Gemini

1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Click **Get API key** → **Create API key**.
3. Copy the generated key (`AIza...` format).

**Free limits:** 15 requests/minute, 1,500 requests/day (as of 2025).

#### OpenAI

1. Log in to [OpenAI Platform](https://platform.openai.com/).
2. Profile (top-right) → **API keys** → **Create new secret key**.
3. Copy the key (`sk-proj-...` format).

#### Anthropic

1. Log in to [Anthropic Console](https://console.anthropic.com/).
2. Left menu **API Keys** → **Create Key**.
3. Copy the key (`sk-ant-...` format).

---

## Model Assignment

Assign different models per function to optimize cost and performance.

| Function | Recommended Models |
|----------|-------------------|
| **Chat** | Gemini 2.0 Flash, GPT-4o-mini |
| **Reports** | GPT-4o, Claude 3.5 Sonnet |
| **Image Generation** | DALL-E 3 |
| **Embeddings** | text-embedding-3-small, gemini-embedding-001 |

---

## Advanced Parameters

| Parameter | Description | Default |
|---------|-------------|---------|
| **temperature** | Response creativity/randomness (0.0–2.0) | 0.7 |
| **max_tokens** | Maximum response tokens | 4096 |
| **top_p** | Cumulative probability sampling (0.0–1.0) | 1.0 |

---

## FAQ

**Q. Can I register API keys for multiple providers?**
Yes. Register multiple provider keys simultaneously and assign different models per function.

**Q. Can I run completely free with Ollama?**
Yes. Install Ollama locally and connect via custom endpoint to use without external API costs.

**Q. Does changing models affect existing conversations?**
No. Model changes apply to new conversations only. Existing conversation history is preserved.
