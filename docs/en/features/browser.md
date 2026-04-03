---
title: Browser Control
nav_order: 18
parent: Features
grand_parent: 🇺🇸 English
---

# Browser Control

## Overview

Starnion's Browser Control feature allows the AI to automatically operate a real Chrome browser. Navigate URLs, click buttons, type text, fill out forms, and capture page screenshots — all with a single natural language command.

It runs on Chrome DevTools MCP, and **Chrome is all you need — no separate installation required**. The agent automatically launches and manages Chrome.

Screenshots are automatically uploaded to cloud storage (MinIO), attached as images in chat, and **also saved to the Images menu** automatically. You can view them immediately in both Telegram and web chat.

---

## Activation

The browser feature is enabled by default. It automatically starts in any environment where Chrome is installed.

**`~/.starnion/starnion.yaml` configuration:**

```yaml
browser:
  enabled: true              # Enable/disable browser feature
  headless: false            # false: show browser window (default), true: run in background
  control_port: 18793        # Browser control server port (default)
  # url: http://127.0.0.1:9222  # Only set this to connect to an already-running Chrome
```

**Environment variables:**

```bash
BROWSER_ENABLED=false          # Disable browser feature
BROWSER_HEADLESS=true          # Force headless mode
BROWSER_CONTROL_PORT=18793     # Change port
BROWSER_URL=http://127.0.0.1:9222  # Connect to an existing remote Chrome instance
```

---

## Headless / Headed Mode

| Mode | Description | Use Case |
|------|-------------|----------|
| **Headed** (default) | Browser window shown on screen | Desktop environment, local development |
| **Headless** | Runs in background without a window | Server environment, Docker, CI |

```bash
# Force headless (env var takes priority)
BROWSER_HEADLESS=true

# Configure in starnion.yaml
browser:
  headless: true
```

---

## Usage Examples

### Taking a Screenshot

```
You: Search for today's weather in Seoul on Naver
Bot: [Controlling browser...]
    ![Screenshot](http://localhost:8080/api/files/browser/screenshots/uuid.png)
    Here is a screenshot of the current weather in Seoul.

You: Capture https://maps.google.com
Bot: [Controlling browser...]
    ![Screenshot](http://localhost:8080/api/files/browser/screenshots/uuid.png)
    Here is a screenshot of Google Maps.
```

> Screenshots are automatically saved to the **Images menu**.

### Route Search & Capture

```
You: Search for a route from Yangjae to Haeundae on Naver Maps and capture the screen
Bot: I'll navigate to Naver Maps and search for the route!
    [Click Directions → Enter start/end → Select autocomplete...]
    ![Route Screenshot](http://localhost:8080/api/files/browser/screenshots/uuid.png)
    Here is the route from Yangjae to Haeundae. Estimated time: about 4 hours 17 minutes, 397km.
```

### Web Page Navigation and Clicking

```
You: Type "weather" in the Google search box and search
Bot: Navigated to Google, typed "weather" in the search box, and pressed Enter.
    ![Search Results](http://localhost:8080/api/files/browser/screenshots/uuid.png)
```

### Form Input

```
You: Enter test@example.com in the email field on the login page
Bot: Found the email input field and entered test@example.com.
```

---

## How It Works

```
User Request
    ↓
Agent (Claude) runs starnion-browser.py command
    ↓
Browser Control Server (127.0.0.1:18793) → Chrome DevTools MCP
    ↓
Real Chrome browser interaction (click, type, capture, etc.)
    ↓
Screenshot: Upload to MinIO → Generate URL
    ↓
Agent responds with Markdown image: ![alt](url)
    ↓
Gateway: Send image to Telegram + save to Images menu
```

---

## Supported Commands

The AI selects these automatically, but you can reference them when making specific requests.

| Command | Description | Example Request |
|---------|-------------|-----------------|
| `snapshot` | AI page snapshot (detects clickable elements) | "Show me the structure of the current page" |
| `navigate` | Navigate to URL | "Open Google" |
| `screenshot` | Screenshot current page | "Capture the current screen" |
| `click` | Click an element | "Click the OK button" |
| `fill` | Type text into an input field | "Type weather in the search box" |
| `fill_form` | Fill multiple inputs at once | "Enter my email and password" |
| `press` | Press a key | "Press Enter" |
| `hover` | Hover over an element | "Hover the mouse over the menu" |
| `wait` | Wait until specific text appears | (used automatically) |
| `tabs` | List open tabs | "Show me the open tabs" |
| `open` | Open a new tab | "Open Naver in a new tab" |

---

## Search URL Patterns

Using direct search URLs is faster and more reliable than clicking the search box on a homepage.

| Search Engine | URL Pattern |
|---------------|-------------|
| Naver | `https://search.naver.com/search.naver?query=keyword` |
| Google | `https://www.google.com/search?q=keyword` |
| Daum | `https://search.daum.net/search?q=keyword` |
| YouTube | `https://www.youtube.com/results?search_query=keyword` |

---

## Autocomplete Handling

For input fields with autocomplete (search boxes, address inputs, etc.), always follow this sequence:

```
1. Fill text with fill
   ↓
2. Take snapshot to check autocomplete list
   ↓
3. Find the autocomplete item ref and click to select
   ↓
4. Proceed to the next step
```

> **Note:** Autocomplete items must be **clicked**, not selected with the Enter key.

---

## Image Saving

Screenshots are processed automatically.

```
Screenshot taken
    ↓
PNG uploaded to MinIO (browser/screenshots/)
    ↓
URL generated: /api/files/browser/screenshots/uuid.png
    ↓
Markdown image included in agent response: ![Screenshot](url)
    ↓
Automatically saved to Images menu (source: browser, type: screenshot)
```

---

## Configuration Reference

```yaml
# ~/.starnion/starnion.yaml
browser:
  enabled: true
  control_port: 18793        # Browser control server port
  headless: false            # true: background, false: show window
  evaluate_enabled: false    # Allow JavaScript execution (default false for security)
  # url: http://127.0.0.1:9222  # Directly connect to running Chrome
```

---

## FAQ

**Q. Does Chrome launch automatically?**
Yes. The agent automatically launches and manages Chrome through Chrome DevTools MCP. No separate installation or configuration is needed — just Chrome.

**Q. Can I use an existing Chrome window I already have open?**
Yes. Launch Chrome with the `--remote-debugging-port=9222` flag, then set `browser.url: http://127.0.0.1:9222` in `starnion.yaml`.

**Q. If a screenshot doesn't appear in the Images menu?**
The agent must include the URL in the response as `![Screenshot](url)` format for it to be saved. If it's not being saved, try asking: "Include the screenshot as a markdown image in your response."

**Q. Can it control sites that require login?**
Yes. Just ask "Enter user@example.com in the email field" or "Enter the password in the password field". Note that passwords will remain in chat history, so use caution.

**Q. What if the map screenshot appears blank?**
This happens when the map tiles haven't finished loading before the capture. Try asking: "Wait 5 seconds before taking the screenshot."

**Q. What if the site blocks automated access?**
Some sites block automation. Use `snapshot` to extract the page text and summarize the content instead.

**Q. How do I use headed mode in a Docker environment?**
A virtual display (Xvfb) is required for headed mode inside a Docker container. Using headless mode is recommended in Docker environments.
