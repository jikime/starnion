---
title: Browser Control
nav_order: 18
parent: Features
grand_parent: 🇺🇸 English
---

# Browser Control

## Overview

Starnion's Browser Control feature lets the AI automatically operate a real Chromium browser. Navigate URLs, click buttons, type text, and capture page screenshots — all with a single natural language command.

Screenshots are automatically attached as images in the chat, visible immediately in both Telegram and the web chat interface.

---

## Activation

The browser skill is disabled by default. Playwright must be installed on the server before use.

```bash
# Install Playwright (inside the agent container or native environment)
playwright install chromium
playwright install-deps chromium
```

After installation, enable the `browser` skill in **Settings > Skills**.

---

## Headless / Headed Mode

Controls whether the browser displays a visible window (headed) or runs invisibly (headless).

### Auto-Detection (Default)

The mode is determined automatically by analyzing the runtime environment — no manual configuration required.

| Environment | Mode | Detection |
|-------------|------|-----------|
| Docker container | Headless | `/.dockerenv` file present |
| CI environment (GitHub Actions, etc.) | Headless | `CI` env var detected |
| Linux (no display server) | Headless | `DISPLAY` / `WAYLAND_DISPLAY` not set |
| macOS / Windows | Headed | Desktop environment |
| Linux (display server present) | Headed | `DISPLAY` is set |

### Manual Override

Override auto-detection using an environment variable or config file.

**Environment variable (highest priority):**

```bash
BROWSER_HEADLESS=false   # Force headed (show browser window)
BROWSER_HEADLESS=true    # Force headless
```

**`~/.starnion/starnion.yaml`:**

```yaml
browser:
  headless: false   # Force headed
```

Priority: `BROWSER_HEADLESS` env var > `starnion.yaml` > Auto-detection

---

## Usage Examples

### Taking a Screenshot

The most common use case. Opens a URL and sends the screenshot as an image in chat.

```
You: Search for today's weather in Seoul on Naver
Bot: [Controlling browser...]
     [Screenshot image attached]
     Here is a screenshot of the current Seoul weather.

You: Capture https://www.google.com/maps
Bot: [Controlling browser...]
     [Map screenshot image attached]
     Here is a screenshot of Google Maps.
```

### Web Page Navigation and Clicking

```
You: Open the Naver login page
Bot: Naver login page opened. Title: NAVER

You: Click the login button
Bot: Clicked the 'Login' button.
```

### Typing Text

```
You: Type "intro to machine learning" in the search box
Bot: Text entered in the search box.

You: Press Enter
Bot: Enter key pressed.
```

---

## How Screenshots Work

A multi-stage loading detection strategy is used to ensure high-quality screenshots.

```
1. DOM Load (domcontentloaded)
      ↓
2. Network idle wait (up to 15 seconds)
   — Waits until AJAX / API calls complete
      ↓
3. DOM Stability Detection (MutationObserver)
   — "Loading complete" when no DOM changes for 800ms
   — Maximum wait: 12 seconds
   — Accurately detects SPA "spinner → results" transition
      ↓
4. Extra wait (optional, wait_ms parameter)
   — Add manual delay for maps, charts, etc.
      ↓
5. Canvas Detection → Automatic 4-second extra wait
   — Waits for tile rendering on maps (Google Maps, Naver Maps, etc.)
      ↓
6. Capture and send image
```

> **Tip:** For map screenshots, Canvas auto-detection ensures tiles are fully loaded before capture. If the result is still incomplete, you can specify `wait_ms=3000` for additional wait time.

---

## Available Tools

The AI selects these automatically, but you can reference them when giving specific instructions.

| Tool | Description | Example Request |
|------|-------------|-----------------|
| `browser_open_screenshot` | Open URL + screenshot (one step) | "Take a screenshot of this URL" |
| `browser_navigate` | Navigate to URL | "Open Google" |
| `browser_screenshot` | Screenshot current page | "Capture the current screen" |
| `browser_click` | Click an element | "Click the OK button" |
| `browser_type` | Type text | "Type 'weather' in the search box" |
| `browser_press` | Press a key | "Press Enter" |
| `browser_hover` | Hover over an element | "Hover over the menu" |
| `browser_scroll` | Scroll the page | "Scroll down" |
| `browser_snapshot` | Get accessibility tree | "Tell me the page structure" |
| `browser_wait_for` | Wait for an element | (used automatically) |
| `browser_wait_ms` | Wait a specified duration | (used automatically) |
| `browser_get_text` | Extract all text from page | "Get the text from this page" |
| `browser_evaluate` | Execute JavaScript | (advanced use) |
| `browser_close` | Close the browser | "Close the browser" |

---

## Search URL Patterns

Using direct search URLs is faster and more reliable than clicking the search box on a home page.

| Search Engine | URL Pattern |
|---------------|-------------|
| Naver | `https://search.naver.com/search.naver?query=keyword` |
| Google | `https://www.google.com/search?q=keyword` |
| Daum | `https://search.daum.net/search?q=keyword` |

---

## Session Management

- Browser sessions are maintained per user.
- A session is automatically closed after **5 minutes** of inactivity.
- Say "Close the browser" after completing a task to release server resources immediately.
- The session remains active after a screenshot, so you can continue clicking and typing.

---

## FAQ

**Q. Can it control sites that require login?**
Yes. You can say "Enter user@example.com in the username field" or "Enter the password in the password field". Note that passwords will appear in chat history, so use caution.

**Q. What if the screenshot shows a loading screen?**
DOM stability detection handles most cases automatically. For special pages, try "Take a screenshot after waiting 3 more seconds" — the AI will use `wait_ms=3000`.

**Q. What if the map screenshot shows a blank white screen?**
The Canvas auto-wait (4 seconds) handles most cases, but may not be enough on slow networks. Try "Take a map screenshot after waiting 5 seconds".

**Q. What if the site blocks automated access?**
Some sites block bot access. In this case, use `browser_get_text()` to extract only the text content and summarize it.

**Q. How do I use headed mode in a Docker environment?**
Running headed mode inside a Docker container requires a virtual display (Xvfb). It is recommended to use headless mode by default in Docker environments.
