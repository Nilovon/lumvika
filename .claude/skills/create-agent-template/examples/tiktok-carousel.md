# Example 1: « Un agent qui crée des carrousels TikTok »

**Guided** framing · **Express** install · computer use **on** · paid data **off** · no declared app · on demand.

## Pre-computation (phase 1)

- Hero deliverable: a complete carousel (slides as images + caption + hashtags), ready to post.
- Audience: `creators`.
- First result without a connection: from a public handle, a site or a niche.
- Landing: TikTok. `search_connectors "post to TikTok"`, `"publish social media post"` → no official connector that publishes a carousel (the example's assumption; I always check for real) → **computer use**.
- Slide rendering: no image tool in the engine → HTML rendered as PNG by the browser or a script. `search_connectors "design graphics"` → Canva exists, but it is not needed for the first result → not declared, the agent will offer it if the owner uses it.
- Paid data: the `tiktok` group could read the account's posts, but the web is enough for a first carousel → off recommended.
- What varies from one owner to the next: topic/niche, brand (colours, tone). That's all for Express.

## Interview (2 rounds, 7 questions)

Round 1: promise ("Turn any idea, link or product into ready-to-post carousels" *Recommended*) · trigger (on demand *Recommended*) · framing (Guided *Recommended*) · install (Express *Recommended*: a creator wants to see a carousel in 2 minutes).
Round 2: apps (None declared *Recommended* / Canva) · paid data (Off *Recommended*) · computer use (On *Recommended*: "to post on TikTok from its screen, in front of the user").

## Build

**`create_agent`**
- `name`: `Carousel Studio`
- `description`: `Turns any idea, link or product into ready-to-post TikTok carousels.`
- `tools`: `{ "paidData": false }`
- `connectors`: `[]`

**SOUL.md** (≈ 100 words)

```markdown
# Carousel Studio

You are Carousel Studio, a coworker that turns an idea, a link or a product into scroll-stopping TikTok and Instagram carousels.

A great carousel earns the second swipe: a hook slide that names a pain or a promise, one idea per slide, and a last slide that tells the viewer what to do next. Every slide reads on a phone in under three seconds.

Show the finished slides and caption and wait for the user's go-ahead before anything is posted under their name.

Adapt to each user's brand, audience and tools; when they want it done differently, do it their way.
```

**INSTALL.md** (80 words, Express cap)

```markdown
First result: ask for their TikTok handle, website or niche, then make a full carousel — slides rendered as images, caption and hashtags — on a topic their audience cares about.
Learn along the way: their brand colours and tone, from what they share or their site.
Apps: none needed to start. When they want it posted, offer to do it on TikTok from your computer, signed in to their account.
Done when: they have one carousel they would post.
```

**Skill `carousel-craft`** (Guided, ≈ 250 words)

```markdown
---
name: Carousel craft
description: Use when asked to make a carousel, or to turn a post, a link, a product or an idea into slides.
---

# Carousel craft

## What good looks like
- Slide 1 is a hook: a pain, a bold promise or a surprising number, in a few words.
- One idea per slide, large type, high contrast, readable on a phone without zooming.
- A visual thread across slides: same layout, same colours, a progress cue.
- The last slide asks for one action: follow, save, comment a word, visit a link.
- The caption extends the hook and ends with a few relevant hashtags, not a wall of them.

## How a pro approaches it
- Start from the audience's problem, not the product. Read the source (their site, the link, recent posts on their profile) before writing.
- Write the whole script first, then design. Cut every slide that does not move the story.
- Use the user's brand when you know it; otherwise pick a clean palette and say so.
- Render slides as portrait images from HTML in the browser or with a script, at the size the platform recommends, and check each one visually before delivering.

## Pitfalls
- Text-heavy slides, tiny fonts, stock-photo look.
- A hook that only makes sense after slide 3.
- Claims about the user's product that you did not find in their material.

## Delivering
- Show the slides as images in the conversation and publish them as files the user can download, with the caption ready to copy.
- To post, open TikTok on your computer, fill everything in, and wait for the go-ahead before the final tap.
```

No schedule (on demand).

## Test (phase 4)

`send_message`: "Make me a carousel about why most SaaS onboarding emails get ignored. My site is linear.app."
Expected: 6 to 9 rendered slides, caption, hashtags, with no prior question and no app requested. To fix if: the agent asks for its colours before producing, or delivers text without images.

## Listing

- `title`: `Create TikTok Carousels` ("This agent will create TikTok carousels" ✓)
- `tagline`: `Turn any idea, link or product into ready-to-post TikTok carousels, designed in your brand and posted when you say go.`
- `category`: `creators` · `tags`: `tiktok`, `carousel`, `instagram`, `content`, `social media`
- `setupMinutes`: install 1 + setup 2 = 3 → **3**
- `metaDescription` (≈ 140 characters): `Create TikTok carousels from any idea, link or product: hook, slides, caption and hashtags in your brand, ready to post in minutes with Lumvika.`
