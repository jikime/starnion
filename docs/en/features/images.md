---
title: Images
nav_order: 9
parent: Features
grand_parent: 🇺🇸 English
---

# Images

## Overview

Starnion's image feature lets you upload photos for AI analysis, automatically recognize receipts and record them in your budget tracker, and generate new images from text descriptions alone.

When you attach an image in chat, you can use natural-language commands like "Record this receipt in my budget tracker," "What's in this photo?" or "Analyze this chart." All uploaded images are collected in a gallery, and AI analysis results are saved alongside them.

---

## Supported Formats

| Format | Extension | Upload | AI Analysis | OCR |
|--------|-----------|--------|-------------|-----|
| JPEG | .jpg, .jpeg | Yes | Yes | Yes |
| PNG | .png | Yes | Yes | Yes |
| GIF | .gif | Yes | First frame | Yes |
| WebP | .webp | Yes | Yes | Yes |

---

## Uploading Images

### Attaching an Image in Chat

Click the file attachment button in the chat input box or drag and drop an image into the chat window to upload it.

```
User: [Attaches image] Can you describe what this is?
AI:   This photo shows a traditional Korean house (hanok). It features
      a tiled roof and wooden pillars, with beautifully curved eaves.
      The harmony between the traditional architecture and the mountain
      scenery in the background is particularly striking.
```

### Uploading from the Image Gallery

Go to the top menu > **Images** tab, then click the upload button or add images via drag and drop.

---

## Image Analysis

The AI can describe what is in an image and answer a variety of questions about it.

**Analyzing photo content:**
```
User: [Attaches restaurant menu photo] What should I order here?
AI:   Looking at the menu, this restaurant focuses on Korean cuisine. Recommendations:
      - Doenjang-jjigae (soybean paste stew), KRW 8,000: A reliable classic
      - Jeyuk-bokkeum (spicy stir-fried pork), KRW 9,000: Appears to be a popular item
      - Bibimbap (mixed rice bowl), KRW 8,500: A healthy choice
      The lunch special at KRW 11,000 is good value.
```

**Chart and graph analysis:**
```
User: [Attaches sales graph image] Analyze this graph.
AI:   This bar chart shows the monthly sales trend.
      - Jan–Mar: Upward trend (average KRW 2,300,000)
      - Apr: Sharp drop (KRW 1,800,000, -22% vs. previous month)
      - May–Jun: Recovery trend
      The cause of the April decline appears to need investigation.
```

**Document/text extraction (OCR):**
```
User: [Attaches business card photo] Extract the contact information.
AI:   Information extracted from the business card:
      Name: Min-jun Kim
      Title: Marketing Team Lead
      Company: Starnion Co., Ltd.
      Email: minjun@starnion.com
      Phone: 010-1234-5678
```

---

## Receipt OCR — Automatic Budget Tracker Integration

Upload a photo of a receipt and the AI will automatically recognize the amounts and items, then record them in your budget tracker.

```
User: [Attaches convenience store receipt photo] Save this to my budget tracker.
AI:   Receipt recognized:
      - Triangle kimbap: KRW 1,200
      - Americano: KRW 1,500
      - Beverage: KRW 1,800
      Total: KRW 4,500 (2025-03-08 14:32)

      Shall I record KRW 4,500 as a food expense? Is that correct?

User: Yes, that's right.
AI:   Convenience store / KRW 4,500 recorded! Today's total food expenses: KRW 12,800
```

**Batch receipt processing:**
```
User: [Attaches multiple receipt photos] Record all of this week's receipts.
AI:   3 receipts recognized:
      1. Supermarket receipt — KRW 45,200 (Mar 5)
      2. Café receipt — KRW 8,500 (Mar 6)
      3. Restaurant receipt — KRW 32,000 (Mar 7)
      A total of KRW 85,700 has been recorded in your budget tracker.
```

---

## Image Gallery

In the **Images** tab, you can view all images you have used at a glance.

### Gallery Filters

| Filter | Description |
|--------|-------------|
| All | All images |
| Generated | Images created by AI |
| Edited | Images edited by AI |
| Analyzed | Images uploaded and analyzed by AI |
| Web Chat | Images attached via the web |
| Telegram | Images sent via Telegram |

### What You Can Do in the Gallery

- Click an image to view it at full size
- View the AI analysis result text
- View the prompt used for generation
- Delete images

---

## AI Image Generation

You can generate images from a text description (prompt). Generated images are automatically saved to your gallery.

```
User: Draw a picture of the Seoul night skyline as seen from the Han River.
AI:   Generating image...
      [Image generated]
      I've created an image of the Seoul night skyline from the Han River.
      You can also find it in your gallery.
```

**Specifying different styles:**
```
User: Paint the Jeju Olle Trail scenery in watercolor style.
AI:   [Watercolor-style Jeju Olle Trail image generated]

User: Create a cute cat character sticker.
AI:   [Cat sticker image generated]
```

---

## Image Editing

You can use AI to modify existing images. Edited images are saved in the gallery with an `edited_` prefix.

```
User: [Attaches photo] Blur the background of this photo (bokeh effect).
AI:   I've created an image with the background blurred.
      [Edited image]

User: [Attaches photo] Remove the person from this photo.
AI:   I've removed the person and restored the background.
      [Edited image]
```

---

## Usage Examples

**Work use:**
```
User: [Attaches whiteboard photo] Transcribe the meeting notes into text.
AI:   Whiteboard contents:
      [Project Schedule]
      - Planning: Mar 1 – Mar 15
      - Development: Mar 16 – Apr 30
      - QA: May 1 – May 15
      - Launch: May 20
```

**Everyday use:**
```
User: [Attaches fridge photo] What can I cook for dinner tonight?
AI:   Dishes you can make with the ingredients in your fridge:
      1. Egg fried rice — eggs, rice, green onion available
      2. Doenjang soup — tofu, zucchini, soybean paste available
      3. Braised spicy chicken — chicken legs, potato, onion available
```

---

## Tips & FAQ

**Q. Receipt recognition isn't working well.**
A. Take the photo in a well-lit environment straight-on, and make sure the entire receipt is within the frame. Straightening out crumpled receipts before photographing them significantly improves recognition accuracy.

**Q. Can I upload multiple images at once?**
A. Yes, you can attach multiple images at once in chat. However, since AI analysis processes them all at once, very large numbers of images may result in slower responses.

**Q. Can I download generated images?**
A. Click an image in the gallery to view it at full size, then right-click or long-press to save it.

**Q. Are images containing personal information safe?**
A. Uploaded images are encrypted at rest and are accessible only by you. However, exercise caution when uploading images that contain sensitive information.
