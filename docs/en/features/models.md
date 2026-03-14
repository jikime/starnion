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

### Cloud Providers

| Provider | Key Models | Features |
|----------|-----------|----------|
| **Google Gemini** | Gemini 2.0 Flash, Gemini 1.5 Pro | Free tier available, long context |
| **OpenAI** | GPT-4o, GPT-4o-mini | Strong general performance, wide model range |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Haiku | Safety-focused AI, long context |
| **GLM/Z.AI** | GLM-4 | Optimized for Chinese |

### Local/Self-Hosted Providers

| Provider | Description | Features |
|----------|-------------|----------|
| **Ollama** | Run LLMs locally | Free, no external data transfer |
| **Custom Endpoint** | OpenAI-compatible APIs | Supports vLLM, LM Studio, etc. |

---

## Provider Setup

### Registering API Keys

1. Navigate to **Settings > Models**.
2. Select the provider you want to use.
3. Enter your **API key**.
4. Click **Test Connection** to verify the key is valid.
5. Click **Save**.

> API keys are stored encrypted. Once saved, the full key is never displayed on screen.

### Custom Endpoint Setup

For OpenAI-compatible APIs like Ollama or vLLM:

1. Select **Custom** as the provider.
2. Enter the **Endpoint URL** (e.g., `http://localhost:11434/v1`).
3. Enter an API key if required.
4. Run the connection test.

---

## Model Assignment

Assign different models to different functions to optimize cost and performance.

### Assignable Functions

| Function | Description | Recommended Models |
|----------|-------------|-------------------|
| **Chat** | General conversation, Q&A | Gemini 2.0 Flash, GPT-4o-mini |
| **Reports** | Weekly/monthly analysis reports | GPT-4o, Claude 3.5 Sonnet |
| **Image Generation** | DALL-E, Gemini image generation | DALL-E 3, Gemini Imagen |
| **Embeddings** | Document/conversation vector conversion | text-embedding-3-small |
| **Summarization** | Long document summarization | Gemini 1.5 Pro |

### How to Assign

1. In **Settings > Models**, click the **Model Assignment** tab.
2. Select a model from the dropdown next to each function.
3. Click **Save** to apply immediately.

> Functions without assignments use the system default model.

---

## Advanced Parameters

Fine-tune model behavior with detailed settings.

| Parameter | Description | Default | Range |
|-----------|-------------|---------|-------|
| **temperature** | Creativity/randomness of responses | 0.7 | 0.0 ~ 2.0 |
| **max_tokens** | Maximum tokens in response | 4096 | 1 ~ model limit |
| **top_p** | Nucleus sampling threshold | 1.0 | 0.0 ~ 1.0 |

### Parameter Guide

- **For precise answers**: Lower temperature to 0.1–0.3.
- **For creative writing**: Raise temperature to 0.8–1.2.
- **For longer responses**: Set max_tokens to 8192 or higher.

---

## Cost Optimization Tips

### Model Selection Guide by Use Case

| Usage Pattern | Recommended Setup | Expected Cost |
|--------------|-------------------|---------------|
| Light daily conversation | Gemini 2.0 Flash | Free to very low |
| Business analysis/reports | GPT-4o-mini | Low |
| Complex reasoning/coding | Claude 3.5 Sonnet | Medium |
| Fully free operation | Ollama (local) | Free (electricity only) |

### Leveraging Gemini Free Tier

Google Gemini API offers a free quota. For personal-level usage, you can operate at no cost.

---

## Tips & FAQ

**Q. Can I register API keys for multiple providers?**
Yes. You can register API keys for multiple providers simultaneously and assign different provider models to different functions. For example, use Gemini for chat and OpenAI DALL-E for images.

**Q. Can I use Starnion completely free with Ollama?**
Yes. Install Ollama locally and connect it as a custom endpoint to use without any external API costs. Response speed depends on your local hardware performance.

**Q. Does changing the model affect existing conversations?**
No. Model changes apply only to new conversations going forward. Existing conversation history is preserved as-is.

**Q. The API key is showing as invalid.**
Run the connection test to verify the key. Check on the provider's website that the key is active and has remaining balance.

**Q. I don't know which model to choose.**
For beginners, we recommend Gemini 2.0 Flash. It has a free tier and provides sufficient performance for most daily conversations.
