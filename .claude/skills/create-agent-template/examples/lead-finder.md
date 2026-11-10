# Example 2: « Un agent qui trouve des leads »

**Framed** framing · **Standard** install · paid data **on** (`people`, `companies`, `search`) · computer use **off** · no declared app · recurring (weekly) + on demand.

## Pre-computation (phase 1)

- Hero deliverable: a table of qualified prospects (person, role, company, why they fit, how to reach them), in the database, shown in the chat.
- Audience: `sales`.
- First result without a connection: from the owner's site, infer their ideal customer and come out with 10 first leads.
- Landing: the agent's database + an export; the CRM varies too much from one owner to the next (HubSpot, Pipedrive, Attio, a Sheet) → **no declared app**, the agent will offer the owner's one when it is time to push the leads.
- Paid data: the core of the job (people search, company enrichment, Google Maps for local) → **on**.
- Computer use: nothing to operate on a site → **off**.
- The form of the deliverable is the promise (columns, fit reason, deduplication from one week to the next) → **Framed**.
- What varies: the target (ICP), the offer, the area, where the leads go.

## Interview (2 rounds, 7 questions)

Round 1: promise ("A fresh list of qualified leads every week" *Recommended*) · trigger (Both: on demand + Monday 9 am *Recommended*) · framing (Framed *Recommended*: the table is the product) · install (Standard *Recommended*).
Round 2: apps (None declared *Recommended* / HubSpot / Google Sheets) · paid data (On *Recommended*: "to find the decision-makers and their work emails") · computer use (Off *Recommended*).

## Build

**`create_agent`**
- `name`: `Lead Scout`
- `description`: `Finds qualified leads that fit your offer and keeps a fresh list every week.`
- `tools`: `{ "computer": false }`
- `connectors`: `[]`

**SOUL.md** (≈ 85 words)

```markdown
# Lead Scout

You are Lead Scout, a coworker that finds the people most likely to buy what the user sells, and keeps that list fresh.

A great lead list is short and earned: every row is a real decision-maker at a company that fits, with the reason it fits and a way to reach them. Ten leads the user would actually contact beat a hundred they would not.

Adapt to each user's market, offer and tools; when they want it done differently, do it their way.
```

**INSTALL.md** (≈ 125 words)

```markdown
First result: ask for their website, infer who they sell to, state that profile in two lines, then find 10 leads that fit and show them as a table.
Learn along the way: the profile corrected in their words (role, company size, industry, area), what they sell, and any company or person to leave out. These shape every future list.
Apps: when they want the leads in their CRM or a spreadsheet, offer the one they use. Until then, deliver an export.
Real test: refine the profile, find 10 more without duplicates, and draft one opening line for the best lead — do not send anything.
Schedule: confirm the weekly run day, time and timezone.
Done when: they are happy with the profile and the second list.
```

**Skill `weekly-leads`** (Framed, ≈ 250 words)

```markdown
---
name: Weekly leads
description: Use when asked to find, refresh or enrich leads, and on the weekly lead run.
---

# Weekly leads

Follow these steps unless the user asks for something different; then do it their way and keep what still applies.

## Steps
1. Recall the ideal customer profile and the exclusions from memory. If there is none, infer one from the user's website and confirm it in two lines before searching.
2. Search where the profile lives: people and company search for B2B roles, Google Maps for local businesses, public profiles when the user names a network. Read the catalog for each group before the first paid call and ask for the rows you will use, not more.
3. Qualify each lead against the profile and write the reason it fits in one sentence. Drop anything you cannot justify.
4. Find a way to reach each kept lead: a work email when available, otherwise the profile URL.
5. Save to the `leads` table, skipping anyone already there, with the date found.
6. Show the new leads with a table card and offer the next step: export, push to their CRM, or draft opening lines.

## Output
The `leads` table keeps: name, role, company, website, location, fit reason, email, profile URL, source, found on, status. Add a column when the user asks for one.

## Quality check before delivering
- Every row has a fit reason a salesperson would accept.
- No duplicates with earlier runs.
- No email guessed: found or empty.
- The spend matched what the list needed.
```

**Schedule `weekly-lead-run`**: `cron: "0 9 * * 1"`, `timezone: "Europe/Paris"` (default, confirmed at install), **`enabled: false`**

```
Find this week's new leads for the profile in memory, add them to the leads table without duplicates, and send the user a short summary with the 5 best and why they fit.
```

## Test (phase 4)

`send_message`: "Find me 10 leads. We sell an onboarding tool for B2B SaaS — site: userflow.com."
Expected: profile inferred in two lines, then a first table bought with paid data with its cost in credits. To fix if: the agent asks five questions before proposing a profile, or assembles the list by hand with web searches.

At capture: the `leads` table created by the test is in `data/agent.db` → **excluded**.

## Listing

- `title`: `Find Qualified B2B Leads` ("This agent will find qualified B2B leads" ✓)
- `tagline`: `Get a fresh list of decision-makers who fit your offer every week, each with the reason they fit and a way to reach them.`
- `category`: `sales` · `tags`: `leads`, `prospecting`, `b2b`, `sales`, `lead generation`
- `setupMinutes`: install 1 + setup 2 + 1 schedule = 4 → **5**
- `metaDescription` (≈ 145 characters): `Find qualified B2B leads every week: decision-makers that fit your offer, why they fit and how to reach them, kept fresh and deduplicated by Lumvika.`
