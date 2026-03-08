---
title: Audio
nav_order: 10
parent: Features
---

# Audio

## Overview

Starnion's audio feature automatically transcribes uploaded voice files to text (Speech-to-Text / STT), and lets you save the results as meeting minutes, memos, diary entries, and more.

Upload a meeting recording and the entire content is converted to text within seconds. You can then immediately organize it with commands like "Summarize this" or "Extract only the decisions." All uploaded audio files and their transcripts are collected in the audio gallery.

---

## Supported Formats

| Format | Extension | STT Support | Playback |
|--------|-----------|-------------|----------|
| MP3 | .mp3 | Yes | Yes |
| WAV | .wav | Yes | Yes |
| M4A | .m4a | Yes | Yes |
| OGG | .ogg | Yes | Yes |

---

## Uploading Audio

### Attaching Audio in Chat

Click the file attachment button in the chat input box or drag and drop an audio file into the chat window to upload it.

```
User: [Attaches meeting-recording.mp3] Please transcribe this.
AI:   Converting speech to text...

      [Transcript]
      Team Lead Kim: Today's agenda is the new service launch schedule.
      Assistant Lee: Development is expected to be completed by the end of April.
      Deputy Director Park: Marketing preparation can begin in early May.
      Team Lead Kim: Then let's set the launch date for May 15.

      Total duration: 3 minutes 24 seconds.
```

### Uploading from the Audio Gallery

Go to the top menu > **Audio** tab, then click the upload button or add files via drag and drop.

---

## Speech-to-Text (STT)

Uploaded audio is automatically processed with STT. The transcript is saved in the audio gallery and can be reviewed at any time.

**Examples of using transcripts:**

```
User: [Attaches lecture-recording.mp3] Summarize the key points.
AI:   Lecture summary (total 45 minutes):

      Topic: Introduction to Python Data Analysis

      Key points:
      1. Creating and manipulating Pandas DataFrames
      2. Handling missing values (dropna, fillna)
      3. Group-level aggregation (groupby)
      4. Visualization basics (matplotlib)

      Practice assignment: Analyze survival rates using the Titanic dataset
```

**Automatic meeting minutes:**
```
User: [Attaches meeting.wav] Organize this in meeting minutes format.
AI:   [Marketing Team Meeting Minutes — March 8, 2025]

      Attendees: Team Lead Kim, Assistant Lee, Deputy Director Park
      Date & Time: 2025-03-08 14:00

      1. Agenda: Q2 Marketing Strategy
      2. Discussion:
         - Discussed increasing SNS advertising budget by 50%
         - Pursuing 2 influencer collaboration projects
      3. Decisions:
         - Launch Instagram ads in April
         - Proceed with YouTuber collaboration in May
      4. Next meeting: March 22 at 2:00 PM
```

---

## Using Transcripts

Text converted via STT can be put to a variety of uses.

**Saving as a memo:**
```
User: [Attaches idea-voice-memo.m4a] Save this as a memo.
AI:   Voice content saved as a memo:
      Title: App Idea Memo (2025-03-08)
      Content: Add an AI trainer feature to the workout tracking app,
                feature for recording sets by voice...
```

**Saving as a diary entry:**
```
User: [Attaches today.mp3] Save this as today's diary entry.
AI:   Voice content saved as a diary entry:
      [March 8, 2025]
      There was a team meeting today. Since it was the start of a new project
      I was a little nervous, but the team members helped out well...
```

**Budget tracker integration:**
```
User: [Attaches shopping-record.mp3] Record today's shopping in my budget tracker.
      (Voice: "I went grocery shopping at the supermarket. Vegetables KRW 15,000, meat KRW 32,000, drinks KRW 8,000.")
AI:   Expense items recognized from the voice recording:
      - Vegetables: KRW 15,000
      - Meat: KRW 32,000
      - Drinks: KRW 8,000
      Total of KRW 55,000 recorded as food expenses.
```

---

## Audio Gallery

In the **Audio** tab, you can view all audio files you have uploaded so far.

### Gallery Filters

| Filter | Description |
|--------|-------------|
| All | All audio files |
| Uploaded | Files uploaded directly |
| Generated | Audio created via TTS |
| Web Chat | Files attached via the web |
| Telegram | Files sent via Telegram |

### What You Can Do in the Gallery

- Play audio (in-browser)
- View and edit transcript text
- View file information (filename, size, upload time)
- Delete files

### Editing Transcripts

If the STT result is inaccurate, you can edit it directly. Click the relevant file in the audio gallery to open and edit the transcript text.

---

## TTS — Listening to AI Responses

Use this when you want to receive AI responses as audio rather than text.

```
User: Read today's schedule aloud.
AI:   [🔊 Audio playback]
      "Hello! Here is your schedule for today, March 8.
      You have a team meeting at 10:00 AM,
      and a client meeting is scheduled for 2:00 PM.
      A workout reminder is set for 7:00 PM."
```

---

## Usage Examples

**Meeting recording → automatic summary:**
```
User: [Attaches 90min-planning-meeting.mp3] Summarize in 10 points.
AI:   Planning meeting summary (original: 90 minutes):

      1. Q3 new feature: Social login addition confirmed
      2. UI improvement: Dark mode support ranked priority #1
      3. Budget: Approval to hire 2 additional developers
      4. Schedule: Beta launch target June 30
      5. Marketing: Dedicated team for App Store optimization
      ... (10 points total)
```

**Lecture recording → study notes:**
```
User: [Attaches english-lecture.m4a] Compile unfamiliar words and expressions.
AI:   Key expressions from the lecture:
      - "leverage" (to make use of): "We need to leverage our existing data"
      - "bottleneck": "This is a bottleneck in our process"
      - "iterate": "Let's iterate on this design"
      15 expressions compiled in total. Shall I turn these into flashcards?
```

**Interview recording → text organization:**
```
User: [Attaches interview.wav] Organize this in Q&A format.
AI:   Interview Q&A:

      Q: What do you consider most important in your current role?
      A: I believe it is communication and trust among team members...

      Q: What are your career goals going forward?
      A: My goal is to grow into a technical leader within 5 years...
```

---

## Tips & FAQ

**Q. Can long files (1 hour or more) be transcribed?**
A. Long files may take a significant amount of time to process. For files over 30 minutes, splitting them into multiple parts before uploading will result in faster processing.

**Q. Recognition is poor when multiple people speak at the same time.**
A. Accuracy may decrease when multiple people speak simultaneously or there is significant background noise. Files recorded in a quiet environment yield higher recognition rates.

**Q. Are languages other than Korean recognized?**
A. Major languages including English, Japanese, and Chinese are supported. Mixed-language files are also recognized to a reasonable degree.

**Q. Can I download the transcribed text?**
A. You can view and copy the transcript in the audio gallery. In chat, request "Show me the transcript" to have the full content output as text.

**Q. Can I upload phone call recordings?**
A. Technically yes, but processing recordings of calls made without the other party's consent may have legal implications. Please check the applicable laws in your jurisdiction.
