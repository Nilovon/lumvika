# Lumvika documentation instructions

## About this project

- Public documentation for Lumvika, built on [Mintlify](https://mintlify.com) and living in `apps/docs` of the `lumvika-cloud` monorepo
- Pages are MDX files with YAML frontmatter, configuration lives in `docs.json`
- A page only appears on the site once it is listed in `docs.json` navigation
- Preview locally with `pnpm dev:docs` from the repo root
- For Mintlify product knowledge (components, configuration), use the docs MCP server `https://www.mintlify.com/docs/mcp`

## Terminology

- Box: a room of the workspace that groups agents by team, client or project, not "Space", "project" or "server". It is free, instant and unlimited, and it is not a machine. The code and the API say `space` (`list_spaces`, `space_db_query`), the product says Box
- Machine: the private computer in the cloud a workspace runs on, one per workspace, shared by every agent and every Box inside it. Anything about hosting, isolation, credentials or the shared folder and database belongs to the machine, never to a Box
- Agent: an autonomous worker inside a Box
- App: an integration with an external service, not "plugin" or "connector". The code and the API say `connector` (`attach_connector`), the product says App
- Run: one execution of an agent
- Template: a packaged agent setup installable from the marketplace
- Issue: a piece of work in a project, numbered with the project key (`WEB-12`), assigned to a person or a coworker. Never "task" or "ticket": a task is a coworker's scheduled task, and "Ticket" is only the German UI word
- Chat: the plain assistant of the sidebar, not a coworker. A coworker's own conversation is a chat with that coworker

## Style preferences

- Write in English
- Never use em dashes
- Use active voice and second person ("you")
- Keep sentences concise, one idea per sentence
- Use sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references

## Accuracy

- Every default, bound and limit quoted in a page comes from the code, never from memory. Read the source before writing a number
- Tool parameters mirror `apps/ui/lib/mcp/account-tools.ts`, `apps/ui/lib/mcp/work-tools.ts` and `apps/ui/lib/mcp/template-tools.ts`
- Issue statuses and the allowed moves mirror `packages/contracts/src/work.ts`. Button and label names are quoted from `packages/i18n/messages/en/*.json`
- Prices and plan contents mirror `packages/contracts/src/billing.ts` and `packages/contracts/src/template.ts`

## Content boundaries

- Document the product as a user sees it: Boxes, agents, apps, triggers, templates, billing, and the sidebar areas (projects, issues, review, goals, teams, channels, Chat)
- Never document the `/admin` back office, internal scripts, or infrastructure topology
- Never include API keys, tokens, engine IPs, or database connection strings
