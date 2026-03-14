---
title: Channels
nav_order: 16
parent: Features
grand_parent: 🇺🇸 English
---

# Channels

## Overview

The Channels management page lets you configure and manage the **communication channels** through which you interact with Starnion's AI assistant Nion. Currently, **Telegram Bot** and **Web Chat** are supported, and you can check each channel's connection status at a glance.

> Channels are your gateway to Nion. Whether on Telegram or the web, you get the same seamless AI experience.

---

## Supported Channels

| Channel | Description | Status Display |
|---------|-------------|----------------|
| **Telegram Bot** | Chat via Telegram messenger | Connected / Disconnected |
| **Web Chat** | Chat within the web dashboard | Always available |

---

## Connecting a Telegram Bot

### Step 1: Create a Bot with BotFather

1. Search for [@BotFather](https://t.me/BotFather) on Telegram.
2. Send the `/newbot` command.
3. Set a name and username for your bot.
4. Copy the **API token** you receive.

### Step 2: Register the Token in Starnion

1. Navigate to **Settings** from the sidebar.
2. Enter the bot token in the **Telegram** section.
3. Click **Connect**.
4. On success, the Channels page will show "Connected" status.

### Step 3: Start Chatting

Search for your bot on Telegram and send `/start` to begin a conversation with Nion.

---

## Checking Channel Status

The Channels page displays each channel's real-time status.

| Status | Meaning |
|--------|---------|
| **Connected** (green) | Working normally |
| **Disconnected** (red) | Token expired or configuration error |

If disconnected, re-enter the token in Settings or regenerate the bot.

---

## Feature Comparison by Channel

| Feature | Telegram | Web Chat |
|---------|----------|----------|
| Text conversation | O | O |
| Image sharing | O | O |
| Voice messages | O | X |
| Document attachments | O | O |
| Push notifications | O (Telegram app) | X |
| Offline messages | O | X |

---

## FAQ

**Q. My Telegram bot is not responding.**

Verify that the bot token is correct and check the connection status on the Settings page. If the token has expired, regenerate it with BotFather using the `/token` command.

**Q. Can multiple Telegram accounts use the same bot?**

Each Starnion account can connect to only one Telegram bot. Messages from other Telegram accounts to the same bot will only work for the first linked account.

**Q. Are conversations shared between Web Chat and Telegram?**

Yes, all channel conversations are stored in the same history. You can start a conversation on Telegram and continue it on the web.
