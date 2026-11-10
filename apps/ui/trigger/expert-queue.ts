import { queue } from '@trigger.dev/sdk/v3'

// Every task that scrapes a profile shares this queue. A batch of 20 URLs would otherwise fire up
// to 40 Apify actor runs at once and blow the account's memory quota, which surfaces as opaque
// actor failures rather than a queue wait. The name is kept for the run history.
export const expertScrapeQueue = queue({ name: 'import-expert', concurrencyLimit: 3 })
