# The template page (private draft)

All in English. The page sells **a result**, and only promises what the captured agent really carries (declared apps, skill, schedule). Limits: `packages/contracts/src/template.ts` and `template-display.ts`.

## `title` (≤ 50 characters, sets the slug forever)

Verb + object, 3 to 6 words, in Title Case. Literal test: "This agent will {title}" must be grammatical and name a concrete job.

- Good: `Create TikTok Carousels`, `Find Qualified B2B Leads`, `Copy Winning Competitor Ads`, `Triage Incoming Email`.
- Bad: `Carousel Studio` (the agent's name), `TikTok Assistant`, `Lead Gen Copilot`, `Ad Monitor` (labels with no verb).

The title is **independent of the agent's display name**. I have it validated in the brief, before `create_template`, because the slug can no longer be changed.

## `tagline` (~160 characters, the card's subtitle)

One sentence: what the owner gets, for whom. "Turn any idea, link or product into ready-to-post TikTok carousels, designed in your brand and posted when you say go."

## `longDescription` (markdown, it is the body of the page)

Short, scannable, honest:

```markdown
{1–2 sentences: the outcome, in the reader's words.}

## What it does
- {3–5 bullets, concrete deliverables}

## What you need
- {apps declared and what each unlocks; "nothing to start" when true}
- {paid data: "Optional live data billed on your Lumvika credit" — only if on}

## How setup works
{1–2 sentences: first result in the first minutes, then what it learns and connects.}

## What stays in your hands
- {what it never does without approval: posting, sending, spending}
```

I announce no integration, automation or result figure that the agent does not carry.

## `category`

The audience that installs, not the team that would do the work: `agencies`, `ecommerce`, `saas`, `sales`, `recruiting`, `real-estate`, `legal`, `creators`, `productivity`, `other`.

## `tags`

4 to 8 simple terms someone would type in a search: `tiktok`, `carousel`, `content`, `social media`.

## `setupMinutes` (honest, never 5 by default)

1 min of install
+ 2 per app connected through an OAuth popup
+ 3 + 1 per field for an app whose key has to be fetched from another dashboard
+ 2 if `setup.required`
+ 1 per schedule to confirm
→ rounded up to the next step among 2, 3, 5, 8, 10, 12, 15, 20.

Example: install (1) + setup (2) + no app at the start = 3 → **3**.

## `faq` (4 to 6)

The questions as people type them into Google, answers of 1 to 3 sentences, true for what the agent carries:
- "Can it post to TikTok automatically?"
- "Do I need a Canva account?"
- "How much does it cost to run?" Answer: runs consume Lumvika credit; paid data, if on, consumes credit too: the agent says what each spend cost, and in chat it asks for approval before a large spend. I don't quote an amount and I never promise that every spend is approved.
- "Can I use it for Instagram or LinkedIn too?" Shows the agent's openness.

## `metaDescription` (120 to 155 characters, required at submission)

One SEO sentence with the main keyword at the start. I count the characters before sending.

## Price

`pricingModel: "free"`, `priceAmountCents: 0` unless the author explicitly asks (paid: 500 to 200,000 cents, `one_time` or `recurring`, Stripe to be set up by the author).

## What the MCP cannot write

`story`, `slug`, `status`, `featured`, `leadMagnet`, visibility, `ogImageUrl`. The lead magnet flag is set by an admin after publication; the story is done with `template-story <slug>` once the agents are captured.

## Image

I don't generate one here. Submission does not require an image (the cards draw the board of the captured agents), but a cover sells better: I list it in `humanFollowUp` as recommended and I propose `lumvika-image-from-agent-task` (prompt) then `add_template_image` (https URL, `cover: true`).
