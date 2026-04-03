---
title: Data Garden
nav_order: 15
parent: Features
grand_parent: 🇺🇸 English
---

# Data Garden

## Overview

Data Garden is a dashboard that **visualizes all your Starnion data as a living garden ecosystem**. Your finances, goals, diary emotions, files, and skills are each represented as elements of a growing garden.

> The higher your savings rate, the healthier the tree. Overspend, and clouds start to rain.

---

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  [Scenic backdrop — sky color shifts with your mood]     │
│                                                           │
│  🔔 Wind Bell    ⭐ Scout Star         💊 Time Capsule   │
│                                                           │
│                     🌧 Spending Cloud                     │
│  🎒 Knowledge Backpack                                    │
│                   🌳 Asset Tree (clickable)               │
│                                                           │
│  🌸 Goal Flower Garden   🌊 Magic Lake   🪄 Magic Wand   │
│  🌱 Emotion Seeds                        🔋 Energy Charger│
│  ─────────────── Galaxy Path ─────────────────────────── │
└──────────────────────────────────────────────────────────┘
```

---

## Sky Background — Mood Palettes

The sky color shifts based on the emotions recorded in the last 7 days of diary entries.

| Mood | Sky Colors | Atmosphere |
|------|-----------|------------|
| Joy (매우좋음) | Golden gradient | Warm golden-hour glow |
| Peace (좋음) | Blue gradient | Clear, calm sky |
| Calm (보통) | Purple gradient | Mysterious cosmic haze |
| Sad (나쁨) | Deep purple | Dark night sky |
| Down (매우나쁨) | Deep-space black | Pitch-dark void |

---

## Center: Asset Tree

The centerpiece of the garden. The tree's health reflects your savings rate.

### Health Stages

| Savings Rate | Tree State | Branch Color | Fruits |
|-------------|-----------|-------------|--------|
| ≥ 30% | Healthy | Full color | Up to 5 star fruits |
| 15–29% | Starting to wilt | Desaturated + drooping | Fewer fruits |
| < 15% | Critical | Gray-brown + severe droop | No fruits |

### Persona Aura Ring

An aura ring appears around the tree base, colored to match the active AI persona.

| Persona | Aura Color |
|---------|-----------|
| assistant | Silver-white |
| finance | Green |
| buddy | Pink |
| coach | Orange |
| analyst | Blue |
| counselor | Purple |

### Budget Popup (click the tree)

Clicking the Asset Tree opens a detailed budget popup.

| Info Displayed | Description |
|---------------|-------------|
| **Remaining budget** | This month's remaining budget (green/orange/red coded) |
| **Budget Constellation** | SVG with categories as stars in a circular formation |
| **Total budget / spent** | Numbers and progress bar |
| **Expense rate / savings rate** | Percentage display |
| **Status message** | Contextual message based on budget health |

---

## Spending Cloud (top right)

Rain falls from the cloud when any budget category is overspent.

- **No rain**: All categories within budget
- **Raining**: Animated raindrops from the cloud for over-budget categories
- **Scissors (✂️) animation**: Scissors appear on the tree during overspending

Click the cloud to see a popover listing the over-budget categories and their stats.

---

## Goal Flower Garden (bottom left)

In-progress goals are visualized as tulips. Up to 4 flowers are shown.

### Growth Stages

| Stage | Progress | Appearance |
|-------|---------|-----------|
| Seed | 0–10% | Single twinkling dot |
| Sprout | 10–30% | Stem + bud |
| Growing | 30–55% | Stem + 2 leaves |
| Blooming | 55–80% | 3 petals open |
| Full bloom | 80–100% | Fully open + swaying animation |

Click the flower garden to see all goals and their completion rates in a popover.

---

## Emotion Seeds (bottom left)

The emotions from the last 7 diary entries are shown as small seeds.

- Up to 7 seeds
- Each seed is colored by its mood value
- Bloom animation plays on each seed

---

## Phase 2 Elements

| Element | Location | Data Source | Description |
|---------|----------|-------------|-------------|
| 🔔 **Wind Bell** | Top left | Audio file count | Number of uploaded audio files |
| 🎒 **Knowledge Backpack** | Mid left | Document count | Number of uploaded documents |
| 🌊 **Magic Lake** | Bottom center | Image count | Number of uploaded images, ripple animation |
| 🪄 **Magic Wand** | Bottom right | Active skill count | Number of enabled skills, gem animation |
| 🔋 **Energy Charger** | Bottom right | Monthly token usage | Usage % against 10M token monthly limit |
| ⭐ **Scout Star** | Top center | Web search status | Always displayed (static element) |
| 🌌 **Galaxy Path** | Bottom stripe | Integration count | Number of providers with API keys configured |
| 💊 **Time Capsule** | Mid right | D-Day list | Days remaining until nearest D-Day |

Each element opens a detailed stats popover when clicked.

---

## Special Effects

### Income Star Dust

When income is recorded, golden stars fall from the sky.

- Star count: `income ÷ 200,000`, max 12
- Star dust fall animation
- Floating income stars also appear in the sky proportional to income amount

### Meteors

When a D-Day is within 7 days, meteors streak diagonally across the screen.

- Up to 3 meteors
- 35° angle, 4.5-second cycle
- Count scales with number of approaching D-Days

---

## Data Flow

When Data Garden loads, 12 API calls are made in parallel.

| API Endpoint | Purpose |
|-------------|---------|
| `/api/budget` | Budget categories and spending |
| `/api/goals` | Goal progress |
| `/api/diary?limit=7` | Last 7 days of emotions |
| `/api/finance/summary` | Income and savings rate |
| `/api/dday` | D-Day list |
| `/api/images?limit=50` | Image file count |
| `/api/audios?limit=50` | Audio file count |
| `/api/documents` | Document file count |
| `/api/skills` | Active skill count |
| `/api/usage?days=30` | Monthly token usage |
| `/api/profile/persona` | Current persona |
| `/api/settings/providers` | Number of connected services |

---

## FAQ

**Q. The tree turned gray.**

The tree withers when your savings rate falls below 15%. Reducing spending or increasing income will restore its health.

**Q. Rain keeps falling from the cloud.**

This happens when one or more budget categories are over budget. Click the cloud to see which categories are over-spent, and adjust your budgets accordingly.

**Q. Only 4 flowers are showing.**

The Goal Flower Garden displays up to 4 in-progress goals. Click the garden or navigate to the Goals menu to see all goals.

**Q. The Energy Charger is red.**

The charger turns red when monthly token usage exceeds 80% of the 10M token limit. Reducing chat frequency will help restore the charge level.

**Q. The sky is very dark.**

If your diary emotions for the last 7 days lean toward Sad or Down, the sky will darken. Try writing about your feelings in the diary or chatting with Nion.

**Q. When do meteors appear?**

Meteors appear when a D-Day is 7 days or less away. Register upcoming events in the D-Day menu to trigger them.
