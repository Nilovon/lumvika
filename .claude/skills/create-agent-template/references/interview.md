# The interview: few questions, all with a recommendation

The goal is not to ask everything, it is to have the author settle **the choices that change the build**. Everything else I decide and announce in the brief.

Constraints: `AskUserQuestion`, ≤ 4 questions per round, 2 rounds, 3 at most, ≤ 12 questions in total. Recommended option first, suffixed "(Recommended)". Each option has a one-line description that says **what the choice changes**. The questions are in the user's language, the wordings proposed for the agent in English.

## Pre-computation (phase 1, without asking anything)

For each topic, I fill in this sheet internally before round 1:

| Field | How I find it |
|---|---|
| Hero deliverable | The finished object a professional would hand over. « Créer un carrousel TikTok » → 6 to 8 slides ready to post + caption + hashtags. « Trouver des leads » → a table of qualified prospects with the reason for the fit. |
| Audience | The person who installs, not the team that would do the work. → a category from `TEMPLATE_CATEGORIES`. |
| First result without a connection | What the agent can show with a public URL or an example: the owner's site, their public handle, a niche. |
| Trigger | On demand if the need is one-off; recurring if the deliverable has a freshness (monitoring, reporting, regular content); webhook if an external tool produces the event. |
| Landing | Delivered file (`publish_file`), app (connector), or site with no API (→ computer use). |
| Candidate apps | `search_connectors` by capability. One per role. |
| Paid data | Useful groups according to `capabilities.md`. |
| Computer use | Grid from `capabilities.md`. |
| What varies from one owner to the next | The 2 to 5 preferences that really change the deliverable (brand, tone, target, cadence, destination). This is the material for the INSTALL.md. |

## Round 1: the job and the two dials

**Q1. Promise.** "What promise does the agent carry?": 2 to 3 wordings of the hero deliverable, from the narrowest to the broadest. I recommend the one that produces a visible result in under 5 minutes.

**Q2. Trigger.**
- On demand: the user asks, the agent delivers.
- Recurring: "{proposed cadence}, e.g. every Monday 9 am"; a schedule is created, the install has the cadence and timezone confirmed.
- Both: on demand + a cadence; a schedule is pre-created with `enabled: false`, the install has the cadence and time zone confirmed, then turns it on.
- Webhook: only if the topic says so (a form, a tool that pushes an event).

**Q3. Process framing** (what I put in the agent skill):
- **Open**: SOUL only, no skill. For a creative job or one that changes with every request. The agent relies on its judgment.
- **Guided**: a method skill: what makes a good deliverable, the pitfalls, the sources to check. No imposed steps. *Recommended by default.*
- **Framed**: a skill with steps and an output format, plus a clause "if the user wants it differently, follow the user". For a deliverable whose form is what makes it valuable (a report, a lead table scored by the owner, an audit).

I recommend Framed only when the **form** of the deliverable is the promise; Open when variety is the promise.

**Q4. Install depth** (how much the agent questions its future owner):
- **Express**: 0 or 1 question, a result from the first message, apps offered at the moment they are useful. For a lead magnet that has to "wow" in 2 minutes. INSTALL.md ≤ 80 words.
- **Standard**: 2 or 3 preferences that really change the result, one key app connected, a real test. *Recommended by default.* ≤ 150 words.
- **Guided**: up to 5 points (brand, target, cadence, destination, approval), full real test. For a recurring agent wired to several apps. ≤ 250 words.

I recommend Express for a one-off creative job, Standard for most, Guided only if the agent then runs on its own (schedule) with outgoing actions.

## Round 2: the capabilities

**Q5. Catalog apps** (multiSelect). The candidates from my research, in the format "{Name}: {role: reads / does / publishes}", at most 3 pre-recommended, one per role. Plus the option "None declared: the agent will find in the catalog the ones the owner already uses".
- Declaring an app: its logo appears on the template page, the install offers it at the moment it unlocks the result. Recommend it when the app *is* the product (TikTok, HubSpot, Meta Ads).
- None declared: shorter install, the agent adapts to the owner's tools. Recommend it when the capability has many equivalent providers (email, CRM, storage).

In every case the catalog stays open at runtime (`hub` + `suggestService`): it is what lets the agent offer Outlook to someone who doesn't use Gmail, and get the apps connected during the install. I don't turn it off.

**Q6. Paid data.**
- On: "to {concrete use: find the decision-makers' emails / read an account's last 30 posts}", paid in Lumvika credits. In chat, the agent spends without asking up to 200 credits per task and asks for approval beyond that; in a routine (schedule, webhook), it spends without asking and says what it cost.
- Off: the free web is enough.
The recommendation follows the grid in `capabilities.md`. I always name the use, never "just in case".

**Q7. Computer use.**
- On: "to {post on TikTok / fill in the form / operate Canva} in front of the user".
- Off: everything goes through connectors, the web and files.

## Round 3: only if an answer is really missing

Ask only if the topic includes an outgoing action or a constraint I cannot infer:

- **Approval before acting**: "Does the agent post / send / spend on its own, or show first?"; I always recommend "show first" for a first version of a template; the engine already enforces agreement before a final send on a site.
- **Real business constraint** cited by the author (a country, a deliverable language, a volume).
- **Price**: only if the author mentioned a paid template. Otherwise `free` without a question.

## What I never ask

- The agent's name, the description, the marketplace title, the category, the tags: I propose them in the brief, the author corrects them if they want.
- The future owner's preferences (their tone, their target): that is the INSTALL.md's job.
- Thresholds, scores or formats that the topic does not give.
- A confirmation of each build step: a single OK, on the brief.

## If the author answers "Other"

I rephrase their answer in one line in the brief and I apply it. If it contradicts a golden rule (e.g. « mets un process en 15 étapes »), I apply it in spirit (a Framed skill, adaptation clause included) and I flag it in the brief.
