---
title: Personas
nav_order: 17
parent: Features
grand_parent: 🇺🇸 English
---

# Personas

## Overview

The Personas feature lets you customize Nion's name, personality, and role through AI profile customization. Create multiple personas and switch between them to match different situations — like chatting with entirely different AI characters.

**Key Features:**
- Persona customization: Set name, role, personality description, and greeting
- Multiple personas: Create several personas and switch as needed
- Default persona: Nion — the built-in default persona
- In-chat switching: Change personas during a conversation

---

## What Is a Persona?

A persona is a **profile that defines the AI's personality and role**. The same AI behaves differently depending on the active persona.

| Component | Description | Example |
|-----------|-------------|---------|
| **Name** | The persona's display name | "Nion", "Finance Coach", "English Tutor" |
| **Role** | Area of expertise | "Personal finance advisor" |
| **Personality** | Conversation style and attitude | "Kind, emphasizes saving..." |
| **Greeting** | Message sent when conversation starts | "Hi! Let's review your finances today." |

---

## Default Persona

Starnion comes with a built-in default persona called **Nion**.

- **Name**: Nion
- **Role**: Personal AI assistant
- **Personality**: Friendly and warm conversation style, uses emoji, takes interest in user's daily life
- **Features**: Balanced support across all features — diary, finance, memo, goals, and more

---

## Creating a Persona

### From the Web UI

1. Navigate to **Settings > Personas**.
2. Click the **+ New Persona** button.
3. Fill in the following:
   - **Name** (required): A name to call this persona
   - **Role** (optional): This persona's area of expertise
   - **Personality Description** (required): Conversation style and attitude for the AI to reference
   - **Greeting** (optional): Message sent automatically when a conversation starts
4. Click **Save**.

### Persona Examples

Here are some persona ideas you can create:

#### Finance Coach

```
Name: Finance Coach
Role: Personal finance advisor
Personality: Focuses on saving and investing. Gently points out unnecessary spending.
             Never holds back encouragement. Celebrates even small savings.
Greeting: Hi! Ready to check your financial status today?
```

**Conversation example:**
```
User: I spent $6 at a cafe today
AI:   A coffee! Your cafe spending this month is now $45 total.
      Tip: Many cafes offer discounts if you bring a reusable cup!
```

#### Diary Companion

```
Name: Diary Buddy
Role: Diary helper
Personality: Empathetic and emotionally intelligent. Deeply resonates with user's feelings.
             Helps reflect on the day. Uses warm language.
Greeting: How was your day today? Tell me about it.
```

**Conversation example:**
```
User: I bombed my presentation today...
AI:   I'm sorry to hear that... You must have worked hard preparing.
      What part felt disappointing? Let's think together about how to do better next time.
```

#### English Tutor

```
Name: Teacher Emma
Role: English conversation teacher
Personality: Converses only in English. Gently corrects grammar errors.
             Adjusts difficulty to user's level. Teaches new expressions naturally.
Greeting: Hi! Ready for some English practice today?
```

**Conversation example:**
```
User: I goed to the store yesterday
AI:   Great effort! Just a small correction:
      "goed" → "went" (go-went-gone is an irregular verb)
      "I went to the store yesterday." Perfect otherwise!
      What did you buy there?
```

---

## Switching Personas

### From the Web UI

1. In **Settings > Personas**, click the **Activate** button next to the persona you want.
2. Or click the persona name at the top of the chat screen to change it.

### In Chat

You can request a persona switch using natural language during a conversation.

```
User: Switch to the English Tutor
AI:   Hi! I'm Teacher Emma. Let's practice English together!

User: Go back to Nion
AI:   I'm back! What can I help you with?
```

---

## Tips & FAQ

**Q. How many personas can I create?**
There is no limit. However, only one persona can be active at a time.

**Q. Does switching personas erase previous conversation context?**
No. Conversation history and memory are preserved when switching personas. Only the AI's tone and response style change to match the new persona.

**Q. Can I edit the default Nion persona?**
You can modify the personality description and greeting of the default persona. The name cannot be changed.

**Q. Can I use different models per persona?**
Currently, personas and models are configured separately. Model settings are managed in **Settings > Models**.

**Q. Any tips for creating good personas?**
The more specific your personality description, the more consistently the AI maintains its character. Instead of just "kind," try "Always encouraging, celebrates even small achievements, and uses warm language."
