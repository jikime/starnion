---
title: LLM Providers
nav_order: 1
parent: Integrations
grand_parent: 🇺🇸 English
---

# LLM Providers

## Overview

Starnion is not locked into a single AI model. It supports a wide variety of LLM providers — Gemini, OpenAI, Anthropic Claude, Z.AI, and more — and lets users configure their preferred model and API key. Models can be selected per conversation or linked to a Persona so they are applied automatically.

---

## Supported Providers

| Provider | Identifier | Key Models | Notes |
|----------|------------|------------|-------|
| Google Gemini | `gemini` | gemini-2.0-flash, gemini-1.5-pro | Default provider, free tier available |
| OpenAI | `openai` | gpt-4o, gpt-4o-mini, gpt-4-turbo | Broad ecosystem, strong coding performance |
| Anthropic | `anthropic` | claude-opus-4-5, claude-sonnet-4-5, claude-haiku-3-5 | Long context, refined reasoning |
| Z.AI | `zai` | z1-preview, z1-mini | High-performance reasoning models |
| Custom | `custom` | (user-specified) | OpenAI-compatible endpoints |

> **Default setting:** Newly registered users have Gemini set as the default provider.

---

## How to Set Up an API Key

1. Navigate to **Settings** in the web UI.
2. Select the **Models** tab.
3. Select the desired provider and enter your key in the **API Key** field.
4. Check the models you want to use (multiple selections allowed).
5. Click **Save**.

The API key is automatically validated by the backend as soon as it is saved (see [API Key Validation](#api-key-validation) below).

---

## Gemini Setup (Free to Start)

The Gemini API offers a free tier, making it a great place to start.

1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Log in and click **Get API key**.
3. Click **Create API key** → select a project or create a new one.
4. Copy the generated key (format: `AIza...`).
5. Paste it into Starnion Settings > Models > Gemini and save.

**Free tier limits:** 15 requests per minute, 1,500 requests per day (as of 2025).

---

## OpenAI Setup

1. Log in to [OpenAI Platform](https://platform.openai.com/).
2. Click the profile icon in the upper right → **API keys**.
3. Click **Create new secret key**.
4. Enter a key name and create it (format: `sk-proj-...`).
5. The key is only fully visible immediately after creation — copy it right away.
6. Paste it into Starnion Settings > Models > OpenAI and save.

> The OpenAI API is paid. Before use, register a payment method under [billing](https://platform.openai.com/billing).

---

## Anthropic Claude Setup

1. Log in to [Anthropic Console](https://console.anthropic.com/).
2. Click **API Keys** in the left menu.
3. Click **Create Key** and enter a key name.
4. Copy the generated key (format: `sk-ant-...`).
5. Paste it into Starnion Settings > Models > Anthropic and save.

Claude is particularly strong for long document analysis and complex reasoning tasks.

---

## Custom Endpoint Setup

You can connect any server compatible with the OpenAI API (Ollama, LM Studio, vLLM, etc.).

1. Select Settings > Models > Custom.
2. Enter the server address in the **Base URL** field (e.g., `http://localhost:11434/v1`).
3. For **API Key**, you can enter any value for local servers.
4. Enter the model name directly.

---

## Provider Selection Guide

If you are not sure which model to use when, refer to the table below.

| Situation | Recommended Model |
|-----------|------------------|
| Everyday conversation, simple questions | Gemini 2.0 Flash (fast, affordable) |
| Writing and debugging code | GPT-4o or Claude Sonnet |
| Long document analysis (100K+ tokens) | Claude Opus or Gemini 1.5 Pro |
| Minimizing costs | Gemini free tier or GPT-4o-mini |
| Complex math/reasoning | Claude Opus or GPT-4o |

---

## API Key Validation

When you save a key, the Gateway sends a lightweight request to each provider's API to verify its validity.

- **Gemini**: Checks response via `GET /v1beta/models?key=<api_key>`
- **OpenAI**: Checks for 200 response via `GET /v1/models` (Bearer auth)
- **Anthropic**: Checks for 401/403 absence via `POST /v1/messages` with a minimal request
- **Z.AI**: Checks response via `GET /api/paas/v4/models` (Bearer auth)

Validation results are displayed in the UI immediately. If validation fails, the key is not saved.

> When displayed in the UI, the API key is masked showing only the first 4 and last 4 characters (e.g., `AIza...zXYZ`). The full key is only used server-side.

---

## Cost Monitoring

LLM APIs incur costs based on token usage. Starnion records token usage for all API calls.

- Go to **Settings > Usage** to view daily and per-model token usage.
- Input tokens and output tokens are displayed separately.
- Estimated costs are calculated based on the per-model unit price.

For more details, see the [Analytics & Usage](../features/analytics.md) documentation.

---

## FAQ

**Q: Can I set up multiple API keys?**
A: Yes, you can set one key per provider. For example, you can register both Gemini and OpenAI keys simultaneously and select which to use per conversation.

**Q: Can I change the active models without changing the API key?**
A: Yes. If you leave the API Key field empty when saving, the existing key is retained and only the selected model list is updated.

**Q: What happens if I exceed the Gemini free tier limit?**
A: The API returns a 429 error and the conversation is temporarily suspended. Switch to another provider or try again after a short while.

**Q: Can I use a different model for each persona?**
A: Yes, you can assign a specific provider and model to each persona. Configure this under Settings > Personas.
