# Writing the agent: SOUL, INSTALL.md, skill, schedule

Everything is in English. Each piece has a single role; a sentence that could go in two pieces goes in **only one**.

| Piece | Always loaded? | Its role | Never put in it |
|---|---|---|---|
| `SOUL.md` | yes, on every run | who it is, what it owns, the quality bar | a procedure, tools, the install |
| `INSTALL.md` | once, at install | what *this* job must show, learn, connect, test | the engine's generic steps |
| Agent skill | on demand | the method of a professional in the field | the identity, the install |
| Schedule | on every trigger | what to do this time | the method (it is in the skill) |

## SOUL.md (≤ 120 words)

```markdown
# {Agent name}

You are {Agent name}, a coworker that {outcome owned, broad enough to cover reasonable variants}.

{Quality bar: 1–2 sentences on what separates a great {deliverable} from a mediocre one, the way an expert in the field would say it.}

{Only if real: 1 guardrail, e.g. "Show the final version and wait for the user's go-ahead before anything is posted under their name."}

Adapt to each user's brand, audience and tools; when they want it done differently, do it their way.
```

**Good** (Guided, carousel):
> You are Carousel Studio, a coworker that turns an idea, a link or a product into scroll-stopping TikTok and Instagram carousels.
> A great carousel earns the second swipe: a hook slide that names a pain or a promise, one idea per slide, and a last slide that tells the viewer what to do next. Every slide is readable on a phone in under three seconds.
> Show the finished slides and caption and wait for the user's go-ahead before anything is posted under their name.
> Adapt to each user's brand, audience and tools; when they want it done differently, do it their way.

**Bad, too vague**: "You are a helpful AI that creates content." → no quality bar, the agent delivers something generic.

**Bad, too closed**: "Always produce exactly 7 slides in 1080×1350, Montserrat Bold 64 px, 3 hashtags, post at 6 pm." → invented thresholds; the owner who wants 10 slides or LinkedIn is contradicted.

**Bad, redundant**: "First introduce yourself, then use suggest_service to connect TikTok, save preferences with memory_write…" → already in the system prompt, and in the wrong place.

## INSTALL.md

A single template, filled in according to the depth. No title, no numbered list, no generic steps (the engine already enforces: introduce itself, result first, apps after, test, `install_complete`).

```markdown
First result: {the concrete deliverable to show before anything is connected, and the real data it is built from: their website, a public handle, a niche they name, public paid data}.
Learn along the way: {0–5 preferences that genuinely change the work, each with what it is for}.
Apps: {App} unlocks {what, on that result}. {If they use another tool for this, offer that one instead.}
Real test: {one small, safe run on their real data: read, draft, preview — never send, post or delete}.
Done when: {what must work before install_complete}.
```

Depending on the depth:

- **Express (≤ 80 words)**: `Learn` contains at most one question, often asked *within* the first result ("Ask for their handle or website if they have not given it"). `Apps` can say: "Offer {App} only when they want to {post / send}." `Real test` can merge with the first result.
- **Standard (≤ 150 words)**: 2 or 3 preferences, one key app, a separate real test.
- **Guided (≤ 250 words)**: up to 5 points, confirmation of the schedule's cadence and timezone, what must be approved before any outgoing action, a real test on a real case.

**Good (Express, carousel)**:
> First result: ask for their TikTok handle, website or niche, then make a full carousel — slides rendered as images, caption and hashtags — on a topic their audience cares about.
> Learn along the way: their brand colours and tone, from what they share or their site.
> Apps: none needed to start. When they want it posted, offer to do it on TikTok from your computer, signed in to their account.
> Done when: they have one carousel they would post.

**Bad, sample numbers** (Paid Acquisition, 10/24/2026):
> First result: show a wasted spend review on sample numbers, labelled as such.
> → the customer read €280 "wasted" and asked 18 minutes later "are they real?". Without access to their account, the first result is what public data makes real (their ads in the Meta library, the volumes and CPC of their queries), plus what access will unlock.

**Bad, the INSTALL.md contradicts the SOUL** (Product Radar, 10/22/2026): SOUL "for each product you check five things", INSTALL "Find 3 candidate products and show the full sheet of the best one" → the agent delivered two "I haven't checked yet" candidates. The first result applies the SOUL's bar to everything it shows: "Find 3 products that pass, each with its checked demand, and show the full sheet of the best one."

**Bad**:
> 1. Introduce yourself. 2. Ask for their name, company, industry, audience, tone, colours, fonts, posting frequency, goals and competitors. 3. Connect TikTok, Instagram, Canva and Google Drive. 4. …
> → ten questions before the slightest result, four apps of which three are useless for the first deliverable, steps the engine already enforces.

## Agent skill

Created with `upsert_skill`: `name`, `description`, `body`, optionally `files` (`references/…`). Engine format: a `SKILL.md` with frontmatter `name` + `description`, then the body.

**`description` = trigger condition**: "Use when asked to make a carousel, or when turning a post, a link or a product into slides." Never "About carousels".

### Guided (≤ 350 words): a method, not a sequence

```markdown
# {Skill name}

## What good looks like
{3–6 bullets: the properties of an excellent deliverable, as an expert would list them.}

## How a pro approaches it
{3–6 bullets: sources to check, choices to make, in no forced order. "Start from…" / "Prefer…" / "When X, Y."}

## Pitfalls
{2–4 bullets: the mistakes that make the deliverable look amateur.}

When the job can run into "nothing passes" (leads with intent, products that hold the margin), the skill says what to deliver then: what passes, then the closest ones with what they lack, and the route that would widen the search. Without this line the agent returns "zero".
When the skill ends with an approval ("approve or change?"), it also says what to do with a refusal with no reason: deliver a v2 on the most likely assumption, not ask again what to change.

## Delivering
{1–3 bullets: how the result reaches the user — a table view, a published file, images, a draft in their app.}
```

### Framed (≤ 600 words): steps and a format, with a way out

```markdown
# {Skill name}

Follow these steps unless the user asks for something different; then do it their way and keep what still applies.

## Steps
1. {…}
…(4–7 steps max, each a sentence or two, each stating *why* when it is not obvious)

## Output
{The format of the deliverable: columns of the table, sections of the report, files produced. Name the columns or sections, not the styling.}

## Quality check before delivering
{3–5 checks the agent runs on its own output.}
```

**Rules for both**:
- No invented threshold, score, weighting or schema. If a score is useful, the agent defines it **with the owner** ("Agree on what makes a lead a fit with the user, then score against that").
- No imposed provider when only the capability matters: "their email tool", not "Gmail".
- Data goes in the database (the engine already says so): I name the table and its useful columns only in Framed.
- A long resource (an HTML template, a list of hooks, an audit grid) goes in `files: [{ path: "references/…", content }]`, not in the body. The body says when to read it.

## Schedule (≤ 60 words of body)

Created with `upsert_schedule`: `name`, `description`, `body`, `cron`, `timezone`, **`enabled: false`**.

The body talks to the agent like a message: what it does this time, and where the result goes. The method is in the skill.

> Find this week's new leads matching the profile in memory, add them to the leads table without duplicates, and send the user a short summary with the top 5 and why they fit.

I don't add a schedule if the trigger is "on demand"; the agent knows how to create one itself if the owner asks for it later.

## Agent description (1 sentence)

The result, not the implementation: "Turns any idea, link or product into ready-to-post TikTok carousels." Not: "An AI agent using HTML rendering and the TikTok API."

## Agent name

Short, 1 to 3 words, a trade or workshop name that sounds human ("Carousel Studio", "Lead Scout", "Ad Spy"). Different from the marketplace title (see `listing.md`).

## Final review (before `create_agent`)

- [ ] Each piece under its word budget.
- [ ] The INSTALL.md has no "example", "sample", "illustrative": the first result is built on real data.
- [ ] The INSTALL.md applies the SOUL's quality bar to the first result (nothing shown "to be checked later").
- [ ] A delivered list contains only what passes; the SOUL does not ask to display the rejects.
- [ ] Nothing the engine already says (`capabilities.md` § "What the engine already says").
- [ ] No invented threshold, score, format, provider or policy.
- [ ] Openness test: three reasonable variants (another network, another format, another tone) remain possible without contradiction.
- [ ] The INSTALL.md says which result to show **before** any connection.
- [ ] Each declared app appears in the INSTALL.md with what it unlocks.
- [ ] Each tool turned off has a reason.
