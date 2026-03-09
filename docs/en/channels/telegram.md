---
title: Telegram Bot
nav_order: 1
parent: Channels
grand_parent: 🇺🇸 English
---

# Telegram Bot

Using Starnion on Telegram lets you access your AI assistant from anywhere on your smartphone. You can use the web UI and Telegram simultaneously, and your conversation history is unified under a single account.

---

## Overview

With the Telegram channel you can:

- Chat with Starnion using the Telegram app on your smartphone
- Send images, voice messages, and document files
- Mention the bot in group chats to use it there
- Use the same skills and memory as the web UI

---

## Step 1: Create a Telegram Bot

Telegram bots are created through **BotFather**.

1. Search for [@BotFather](https://t.me/BotFather) on Telegram and open a chat.
2. Send `/start`.
3. Send `/newbot`.
4. Enter a name for your bot (e.g., `My Starnion`).
5. Enter a username for the bot. It must end with `bot` (e.g., `my_starnion_bot`).
6. BotFather will issue a **Token**.

```
BotFather: Done! Congratulations on your new bot. You will find it at t.me/my_starnion_bot.
Use this token to access the HTTP API:
1234567890:ABCDefGHIjklMNOpqrsTUVwxyz1234567890
```

Copy the issued token — you will need it in the next step.

> **Security note:** The token is like a password. Never share it publicly.

---

## Step 2: Register the Bot with Starnion

1. Log in to the Starnion web UI.
2. Click **Settings** in the left menu.
3. Select the **Channels** tab.
4. In the **Telegram** section, paste the copied token into the **Bot Token** field.
5. Click **Save**.
6. Turn on the **Enable Bot** toggle.

When saved successfully, the status will display as **running**.

> **Note:** A single bot token can only be registered to one account. Entering a token that is already registered to another account will produce an error.

---

## Step 3: Link Your Telegram Account (Pairing)

Registering a bot alone does not link Telegram to your Starnion account. You must complete **pairing** to associate "this Telegram account is my Starnion account."

### How to Pair

1. Search for your bot (`@my_starnion_bot`) on Telegram and open a chat.
2. Send any message (e.g., `Hello`).
3. If the bot's **DM policy** is set to `pairing`, the bot will respond with "Pairing request sent."
4. Go to the Starnion web UI > **Settings > Channels > Telegram** and check the **Pairing Requests** list.
5. Verify your Telegram account name and click **Approve**.
6. You can now chat normally with the bot on Telegram.

---

## Pairing Policies

You can configure the **DM policy** and **Group policy** in the channel settings.

### DM Policy (Direct Messages)

| Policy | Behavior |
|--------|----------|
| `allow` | Anyone who sends a DM to the bot receives an immediate response. |
| `pairing` | Only paired accounts receive responses. Unpaired users can send a pairing request. |
| `deny` | All DMs are ignored. |

### Group Policy (Group Chats)

| Policy | Behavior |
|--------|----------|
| `allow` | Responds to all messages in the group. |
| `mention` | Responds only when the bot is mentioned (`@bot_name`). |
| `deny` | Ignores all group messages. |

> **Recommended settings:** For personal use, setting DM policy to `pairing` and group policy to `mention` maintains security while keeping usage convenient.

---

## Using the Bot

### Basic Conversation

Once pairing is complete, chat as you would in any messaging app.

```
Me: What's the weather like today?
Bot: Current weather in Seoul: clear, 22°C. ...

Me: I spent 12,000 won on lunch
Bot: Recorded lunch expense of 12,000 won. Total food spending this month: 87,500 won

Me: Find me a Python tutorial
Bot: I searched the internet for Python tutorials...
```

### Sending Images

Images you send are automatically analyzed.

```
(send a receipt photo)
Bot: I analyzed the receipt.
    Supermarket total: 35,600 won
    Items: milk 2,800 won, bread 4,500 won, ...
    Shall I record this in your expense tracker automatically?
```

### Voice Messages

When you send a Telegram voice message (voice memo), it is transcribed to text and processed.

```
(voice message: "Had samgyeopsal for dinner with friends tonight, 20,000 won per person")
Bot: Voice message recognized.
    Recorded dinner (samgyeopsal) expense of 20,000 won.
```

### Document Files

Sending PDF, Word, text files, etc. causes the bot to analyze the content or save it to the knowledge base.

```
(send a PDF file)
Bot: Processed document "contract_2024.pdf".
    Total 15 pages, main content: rental agreement...
    Saved for search.
```

---

## Using Multiple Devices Simultaneously

Starnion supports using the web UI and Telegram at the same time. Both channels connect to the same AI agent, so anything recorded in one channel can be retrieved from the other.

```
[In the web UI]
Me: Reading goal: read 3 books this month

[In Telegram]
Me: What was my reading goal again?
Bot: Your goal is to read 3 books this month. You have completed 1 so far.
```

---

## Using in Group Chats

You can invite the bot to a group and use it by mentioning it.

1. In a group chat, select **Add Member** > search for the bot's username and invite it.
2. If the group policy is `mention`, use the format `@bot_name message` to mention it.

```
Me: @my_starnion_bot Our team lunch was 150,000 won total — how much does each of 5 people pay?
Bot: 30,000 won per person.

Me: @my_starnion_bot What time is it in New York?
Bot: Current time in New York (EST) is 2:15 AM.
```

---

## Important Notes

- **One token = one account:** A single bot token can only be linked to one Starnion account.
- **Bot token security:** If your token is leaked, immediately reissue it with the `/revoke` command in BotFather and update the new token in your Starnion settings.
- **Server restart:** When the Starnion gateway restarts, any enabled bots are automatically resumed.

---

## Troubleshooting

### Bot Not Responding

1. Check that the status shows **running** under Settings > Channels > Telegram.
2. If the status shows **configured**, the bot is disabled. Turn on the **Enable Bot** toggle.
3. **Even if the status is running** and there is no response:
   - Check that the DM policy is not set to `deny`.
   - If pairing is required, complete the pairing process.

### 409 Conflict Error

This occurs when two servers are running simultaneously with the same bot token.

- Do not run Docker and a local development environment at the same time.
- Fully shut down the previous server before starting a new one.
- Starnion uses PostgreSQL advisory locks to prevent conflicts.

### Pairing Not Working

- Verify that the bot is in an active state.
- If the DM policy is `deny`, pairing requests are blocked entirely. Change it to `pairing` or `allow`.
- Check that you approved the request shown in the pairing request list in the web UI.

---

## FAQ

**Q. Can I use Starnion without a Telegram bot?**
Yes, you can use all features with just the web UI. Telegram is an optional additional channel.

**Q. Can multiple people use the same Telegram bot?**
No. Each user must create their own separate bot. However, multiple paired users in a group chat can share one bot by mentioning it.

**Q. What happens if I change the bot token?**
The existing bot stops automatically and restarts with the new token. Previously paired account information is retained.

**Q. Are conversations stored on Telegram's servers?**
Telegram messages pass through Telegram's servers, but conversation processing and storage in Starnion take place on your own self-hosted server.
