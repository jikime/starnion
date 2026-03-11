---
title: Mind Garden
nav_order: 14
parent: Features
grand_parent: 🇺🇸 English
---

# Mind Garden

## Overview

Mind Garden is Starnion's emotional wellness dashboard. It visualizes the emotions recorded in your diary and delivers context-aware messages through the AI companion Nion. Rather than a simple statistics screen, it is designed as a space to nurture your emotional wellbeing.

> The more you journal, the more the emotion layers fill up and the Healing Tree grows.

---

## Layout

Mind Garden is organized in three columns.

```
┌─────────────────┬──────────────────┬─────────────────┐
│  Healing Tree   │   Nion Center    │ Counseling Space│
│  Emotion Chart  │  (Today's Mood)  │  (Stats)        │
│  Mood Calendar  │                  │  (Mind Flowers) │
│                 │                  │  (Active Goals) │
└─────────────────┴──────────────────┴─────────────────┘
```

---

## Left Column: Healing Tree & Mood Calendar

### Healing Tree

The tree grows as your diary entries accumulate.

| Element | Description |
|---------|-------------|
| **Branches** | Energy flows in 5 emotion-coded colors |
| **Heart Fruits** | One per emotion type, up to 5, with beating animation |
| **Memory Leaves** | 1 leaf per 10 diary entries, max 8 leaves |
| **Central Orb** | Gold sphere with ₩ symbol representing vitality |

### Emotion Layer Chart

Displays the distribution of emotions from your diary as a horizontal bar chart.

- Shows recorded counts per emotion
- Displays top 5 emotions
- Counter at the bottom: **"N memories in total"**

### Monthly Mood Calendar

A monthly calendar where each day shows a color-coded dot for that day's emotion.

| UI Element | Description |
|-----------|-------------|
| **‹ / ›** buttons | Navigate to previous / next month (cannot go to the future) |
| **Color dot** | Displayed in the mood color for that date's diary |
| **Today highlight** | Gold border + gold font |
| **Day-of-week badges** | Sun (pink) / Sat (blue) / Weekday (white) circular badges |
| **Legend** | Color reference for Joy · Peace · Calm · Sad · Down |

---

## Center Column: Nion Center

### Nion Character

AI companion Nion appears in a state matching the current hour.

| Time | Nion State |
|------|-----------|
| Midnight (hour 0) | Healing |
| Every hour after | Plant care → Watching → Polishing → Sweeping |

Orbiting hearts, stars, and dots surround Nion and animate continuously.

### Today's Mood

- The emotion from your most recent diary entry is shown automatically.
- You can also set today's mood directly using the **5 mood selector buttons** at the bottom.
- Nion's healing message updates based on the selected mood.

### Healing Messages

A comforting message is displayed for each mood.

| Mood | Example Message |
|------|----------------|
| Joy (매우좋음) | "What a radiant day! Hold on to that joy ✨" |
| Peace (좋음) | "Your heart feels peaceful. Savor this moment 🌿" |
| Calm (보통) | "Even ordinary days are precious records. You're doing well 💜" |
| Sad (나쁨) | "It's okay to feel this way. Nion is right here with you 💙" |
| Down (매우나쁨) | "You're exhausted. Let's take it slowly, one step at a time 🌙" |

---

## Right Column: Counseling Space

### Session Statistics Card

| Item | Description |
|------|-------------|
| **Donut chart** | Goal completion rate (%) |
| **This week's records** | Number of diary entries in the last 7 days |

### Mind Flowers

Three quick-access buttons for mindfulness activities.

| Button | Destination |
|--------|------------|
| 🧘 Meditation | Diary page |
| 📖 Diary | Diary page |
| 💬 Chat | Chat page |

### Active Goals

Displays up to 3 goals currently in `in_progress` status.

- Icon + title + progress bar + percentage
- Purple-to-pink gradient progress bar

---

## Mood System

Mind Garden uses 5 canonical emotion values.

| Key | Label | Color | Emoji |
|-----|-------|-------|-------|
| `매우좋음` | Joy | Gold `#fbbf24` | ✨ |
| `좋음` | Peace | Green `#34d399` | 🌿 |
| `보통` | Calm | Purple `#a78bfa` | 💜 |
| `나쁨` | Sad | Blue `#60a5fa` | 💙 |
| `매우나쁨` | Down | Indigo `#818cf8` | 🌙 |

When the AI saves free-form emotions ("excited", "tired", "awful", etc.) through chat, they are automatically normalized to one of these 5 values.

---

## Data Flow

```
Chat / Diary entry written
    ↓
Saved to diary_entries table (mood normalized)
    ↓
/api/diary?limit=100  ←── called when Mind Garden loads
/api/goals
    ↓
Emotion count aggregation → Emotion Layer chart
Date-to-mood mapping     → Monthly Mood Calendar
Most recent mood         → Nion healing message
In-progress goals        → Counseling Space goals section
```

---

## Bottom Chat Button

A shortcut to chat with Nion is always visible at the bottom of the screen.

> *"Share what's on your mind with Nion…"*

Clicking it takes you to the Chat page.

---

## FAQ

**Q. No dots appear on the mood calendar.**

Dots only appear for entries whose mood is one of the 5 canonical values (`매우좋음 / 좋음 / 보통 / 나쁨 / 매우나쁨`). Existing entries saved through chat before v1.3.3 are automatically normalized by that migration.

**Q. Nion keeps changing images.**

Nion's state rotates hourly based on the current time. This is expected behavior.

**Q. I clicked a mood button but it wasn't saved.**

The mood selector buttons only change the mood **displayed on the current screen**. To save a mood permanently, write a diary entry through chat or the Diary menu.

**Q. No goals are showing.**

Add goals in the Goals menu and set their status to "In Progress" to see them in the Counseling Space.
