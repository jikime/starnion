---
title: Gemini Integration
nav_order: 6
parent: Integrations
grand_parent: 🇺🇸 English
---

# Gemini Integration

Connecting the Google Gemini API to Starnion lets you use Gemini models in your conversations. Take advantage of Gemini's powerful features like image analysis and multimodal processing.

---

## Overview

With the Gemini integration you can:

- **Chat models**: Use Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash
- **Embeddings**: gemini-embedding-001 (768 dimensions) support
- **Image analysis**: Upload images for content analysis and description
- **Multimodal processing**: Combined text and image understanding

> **Default provider:** Gemini is Starnion's default provider. You can get started with the free tier without any additional API key setup.

---

## Supported Models

| Model | Features | Recommended Use |
|-------|----------|-----------------|
| Gemini 2.0 Flash | Fast responses, latest model | Everyday conversations, quick Q&A |
| Gemini 1.5 Pro | Long context (up to 1M tokens) | Long document analysis, complex reasoning |
| Gemini 1.5 Flash | Balanced performance | General-purpose conversations |
| gemini-embedding-001 | 768-dimensional embeddings | Document vectorization, similarity search |

---

## Prerequisites: Get a Google AI Studio API Key

### Step 1: Create an API Key

1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Log in with your Google account.
3. Click the **Get API key** button.
4. Click **Create API key** → select or create a project.
5. Copy the generated key (`AIza...` format).

> **Free limits:** 15 requests per minute, 1,500 requests per day (as of 2025).

---

## Setup

### Register API Key in Web UI

1. Log in to the Starnion web UI.
2. Go to **Settings** → **Models** tab.
3. Select the **Google Gemini** provider.
4. Paste the copied key (`AIza...`) in the **API Key** field.
5. Check the models you want to use (multiple selection allowed).
6. Click **Save**.

The API key is validated automatically upon saving.

---

## Usage

### Selecting a Model in Conversations

Select a Gemini model from the model dropdown when starting a conversation, or link a Gemini model to a persona for automatic application.

### Image Analysis

```
You: (attach image) What's in this photo?
Bot: This image shows a sunset over the ocean.
     The warm orange and pink hues reflect beautifully on the water surface.

You: (attach chart image) Analyze this chart
Bot: This bar chart shows monthly sales trends.
     Sales have been steadily increasing since March, reaching a peak in June.
```

### Long Document Analysis

```
You: (attach PDF) Summarize this report
Bot: (Using Gemini 1.5 Pro)
     Key points of this report:
     1. Q1 2026 revenue up 15% year-over-year
     2. MAU grew 30% with new service launch
     ...
```

---

## Embedding Configuration

Gemini's embedding model is used for document search, similarity analysis, and more.

- **Model**: gemini-embedding-001
- **Dimensions**: 768
- **Use cases**: Conversation history vectorization, document search, pattern analysis

Embedding settings can be configured in `starnion.yaml` or via environment variables.

---

## Comparison with Other Providers

| Feature | Gemini | OpenAI | Anthropic |
|---------|--------|--------|-----------|
| Free tier | Yes (1,500/day) | No | No |
| Max context | 1M tokens | 128K tokens | 200K tokens |
| Image analysis | Yes | Yes | Yes |
| Embeddings | Yes | Yes | No |

---

## Troubleshooting

### "Gemini API key is invalid"

- Verify the API key is in `AIza...` format.
- Check on [Google AI Studio](https://aistudio.google.com/) that the key is active.

### "Request limit exceeded" (429 error)

- You have exceeded the free limits (15/min, 1,500/day).
- Wait a moment or switch to another provider.

### Image analysis not working

- Verify you are using Gemini 2.0 Flash or Gemini 1.5 Pro.
- Check that the image format is supported (JPEG, PNG, GIF, WebP).

---

## FAQ

**Q: Can I use Gemini for free indefinitely?**
A: Yes, within Google AI Studio's free limits. Charges may apply if you exceed the limits.

**Q: Can I configure Gemini alongside other providers?**
A: Yes, you can register API keys for multiple providers simultaneously and select models per conversation.

**Q: Do I need separate setup for Gemini embeddings?**
A: Once the Gemini API key is registered, embeddings are automatically available. Fine-tune settings in `starnion.yaml`.
