export type SeedMemory = { key: string; kind: string; content: string }

export type QueryCategory = 'keyword' | 'paraphrase' | 'crosslingual' | 'accented' | 'question' | 'task' | 'negative'

export type LabelledQuery = { category: QueryCategory; query: string; expect: string[] }

export const MEMORIES: SeedMemory[] = [
    { key: 'crm', kind: 'fact', content: 'The sales team tracks every deal in HubSpot, not in Pipedrive.' },
    { key: 'invoicing', kind: 'fact', content: 'Invoices are issued from QuickBooks on the first business day of each month.' },
    { key: 'payroll', kind: 'fact', content: 'Payroll runs through Gusto and is approved by Marianne Okafor.' },
    { key: 'founder', kind: 'fact', content: 'The founder and CEO of Brightloom is Tobias Lindqvist.' },
    { key: 'hq', kind: 'fact', content: 'Brightloom is headquartered in Rotterdam, with a second office in Lisbon.' },
    { key: 'fiscal', kind: 'fact', content: 'The fiscal year of the company ends on March 31.' },
    { key: 'pricing', kind: 'fact', content: 'The Growth plan costs 249 euros per month and includes 10 seats.' },
    { key: 'refund', kind: 'fact', content: 'Customers can get a full refund within 30 days of purchase, no questions asked.' },
    { key: 'support-hours', kind: 'fact', content: 'Support is staffed from 8am to 6pm Central European Time, Monday to Friday.' },
    { key: 'biggest-customer', kind: 'fact', content: 'The largest account is Norvik Logistics, worth about 18 percent of annual revenue.' },
    { key: 'competitor', kind: 'fact', content: 'The main competitor is Weavely, which undercuts us on price but has no API.' },
    { key: 'stack', kind: 'fact', content: 'The product backend is written in Elixir and runs on Fly.io.' },
    { key: 'analytics', kind: 'fact', content: 'Product analytics live in Mixpanel; the marketing site uses Plausible.' },
    { key: 'slack-channel', kind: 'fact', content: 'Urgent incidents are announced in the Slack channel #fire-drill.' },
    { key: 'legal', kind: 'fact', content: 'Contracts above 50,000 euros must be reviewed by the outside counsel, Hartmann & Vos.' },
    { key: 'ticket-id', kind: 'fact', content: 'The migration to the new billing system is tracked under ticket OPS-4471.' },
    { key: 'newsletter-day', kind: 'fact', content: 'The customer newsletter goes out every second Thursday at 10am.' },
    { key: 'domain', kind: 'fact', content: 'Transactional emails are sent from mail.brightloom.io, never from the root domain.' },
    { key: 'bank', kind: 'fact', content: 'The company banks with Bunq and keeps a reserve account at ING.' },
    { key: 'hiring', kind: 'fact', content: 'Two backend engineers and one account executive are being recruited this quarter.' },

    { key: 'tone', kind: 'preference', content: 'The user wants replies to be short and direct, without greetings or sign-offs.' },
    { key: 'language', kind: 'preference', content: 'The user prefers to be answered in French, even when the source material is in English.' },
    { key: 'meetings', kind: 'preference', content: 'Never schedule meetings on Wednesday afternoons, that slot is reserved for deep work.' },
    { key: 'currency', kind: 'preference', content: 'Always show amounts in euros, with the dollar equivalent in parentheses.' },
    { key: 'charts', kind: 'preference', content: 'The user dislikes pie charts and wants bar charts instead.' },
    { key: 'emoji', kind: 'preference', content: 'Do not use emojis in anything sent to customers.' },
    { key: 'sources', kind: 'preference', content: 'Every figure quoted in a report must link to where it came from.' },
    { key: 'timezone', kind: 'preference', content: 'The user lives in Montreal and works on Eastern Time.' },
    { key: 'approval', kind: 'preference', content: 'Ask for confirmation before sending any email to someone outside the company.' },
    { key: 'diet', kind: 'preference', content: 'When booking team lunches, remember that the user is vegetarian and allergic to peanuts.' },

    { key: 'fr-compta', kind: 'fact', content: 'La comptabilité est externalisée au cabinet Dubreuil à Lyon, qui clôture les comptes en février.' },
    { key: 'fr-conges', kind: 'fact', content: "L'équipe française pose ses congés d'été entre le 15 juillet et le 20 août." },
    { key: 'fr-fournisseur', kind: 'fact', content: "Le fournisseur d'hébergement des données européennes est Scaleway, région Paris." },
    { key: 'fr-prefere', kind: 'preference', content: 'Le client préfère être appelé plutôt que de recevoir des e-mails, idéalement le matin.' },
    { key: 'fr-salon', kind: 'fact', content: 'La société expose chaque année au salon VivaTech en juin.' },
    { key: 'pt-pagamento', kind: 'fact', content: 'Os clientes brasileiros pagam por Pix e recebem a nota fiscal em até dois dias úteis.' },
    { key: 'pt-reuniao', kind: 'preference', content: 'O gerente de São Paulo prefere reuniões curtas, de no máximo vinte minutos.' },
    { key: 'ja-office', kind: 'fact', content: '東京オフィスの担当者は田中さんで、連絡はメールが望ましい。' },

    { key: 'learned-export', kind: 'learned', content: 'The HubSpot export fails above 10,000 rows; split it by quarter to get around the limit.' },
    { key: 'learned-api', kind: 'learned', content: 'The Mixpanel API rejects date ranges longer than 90 days.' },
    { key: 'learned-pdf', kind: 'learned', content: 'Reports sent to the board must be attached as PDF, the board members do not open links.' },
    { key: 'learned-rate', kind: 'learned', content: 'The QuickBooks sandbox throttles at 500 requests per minute.' },

    { key: 'task-renewal', kind: 'task', content: 'Follow up with Norvik Logistics about their contract renewal before the end of the month.' },
    { key: 'task-audit', kind: 'task', content: 'Prepare the documents for the SOC 2 audit that starts in November.' },
    { key: 'task-webinar', kind: 'task', content: 'Draft the invitation for the product webinar about the new reporting module.' },

    { key: 'note-kpi', kind: 'note', content: 'Monthly churn was 2.1 percent last quarter and the target is to get under 1.5 percent.' },
    { key: 'note-nps', kind: 'note', content: 'The latest NPS survey came back at 47, up from 39 a year earlier.' },
    { key: 'note-roadmap', kind: 'note', content: 'The next major release adds single sign-on and audit logs for enterprise accounts.' },
]

export const QUERIES: LabelledQuery[] = [
    { category: 'keyword', query: 'HubSpot', expect: ['crm', 'learned-export'] },
    { category: 'keyword', query: 'Gusto payroll', expect: ['payroll'] },
    { category: 'keyword', query: 'OPS-4471', expect: ['ticket-id'] },
    { category: 'keyword', query: 'Norvik Logistics', expect: ['biggest-customer', 'task-renewal'] },
    { category: 'keyword', query: 'Weavely', expect: ['competitor'] },
    { category: 'keyword', query: 'Mixpanel date range', expect: ['learned-api'] },
    { category: 'keyword', query: 'SOC 2 audit', expect: ['task-audit'] },
    { category: 'keyword', query: 'NPS score', expect: ['note-nps'] },
    { category: 'keyword', query: 'fire-drill slack', expect: ['slack-channel'] },
    { category: 'keyword', query: 'Hartmann Vos', expect: ['legal'] },

    { category: 'paraphrase', query: 'which tool do reps log opportunities in', expect: ['crm'] },
    { category: 'paraphrase', query: 'who signs off on salaries', expect: ['payroll'] },
    { category: 'paraphrase', query: 'money back guarantee', expect: ['refund'] },
    { category: 'paraphrase', query: 'who runs the business', expect: ['founder'] },
    { category: 'paraphrase', query: 'where are the offices located', expect: ['hq'] },
    { category: 'paraphrase', query: 'how verbose should my answers be', expect: ['tone'] },
    { category: 'paraphrase', query: 'what kind of graphs to avoid', expect: ['charts'] },
    { category: 'paraphrase', query: 'food restrictions for a restaurant booking', expect: ['diet'] },
    { category: 'paraphrase', query: 'programming language of the server code', expect: ['stack'] },
    { category: 'paraphrase', query: 'customer attrition rate', expect: ['note-kpi'] },
    { category: 'paraphrase', query: 'when can I book a call midweek', expect: ['meetings'] },
    { category: 'paraphrase', query: 'who is our rival on the market', expect: ['competitor'] },
    { category: 'paraphrase', query: 'open positions we are trying to fill', expect: ['hiring'] },
    { category: 'paraphrase', query: 'what ships in the upcoming version', expect: ['note-roadmap'] },

    { category: 'crosslingual', query: 'dans quel outil les commerciaux suivent leurs affaires', expect: ['crm'] },
    { category: 'crosslingual', query: 'quelle est la politique de remboursement', expect: ['refund'] },
    { category: 'crosslingual', query: 'quand se termine l’exercice comptable', expect: ['fiscal'] },
    { category: 'crosslingual', query: 'combien coûte l’abonnement', expect: ['pricing'] },
    { category: 'crosslingual', query: 'who does the bookkeeping', expect: ['fr-compta'] },
    { category: 'crosslingual', query: 'when is the French team on holiday', expect: ['fr-conges'] },
    { category: 'crosslingual', query: 'how do Brazilian customers pay', expect: ['pt-pagamento'] },
    { category: 'crosslingual', query: 'who is the contact at the Tokyo office', expect: ['ja-office'] },

    { category: 'accented', query: 'comptabilité', expect: ['fr-compta'] },
    { category: 'accented', query: 'congés d’été', expect: ['fr-conges'] },
    { category: 'accented', query: 'hébergement des données', expect: ['fr-fournisseur'] },
    { category: 'accented', query: 'le client préfère', expect: ['fr-prefere'] },
    { category: 'accented', query: 'reuniões São Paulo', expect: ['pt-reuniao'] },
    { category: 'accented', query: '東京オフィス', expect: ['ja-office'] },

    { category: 'question', query: 'What is the name of the tool that the team is using for the invoices?', expect: ['invoicing'] },
    { category: 'question', query: 'Can you tell me who is the person that is in charge of the company?', expect: ['founder'] },
    { category: 'question', query: 'What is the time of the day at which the support of the company is open?', expect: ['support-hours'] },
    { category: 'question', query: 'Do you know what the user thinks about the use of emojis in the emails?', expect: ['emoji'] },
    { category: 'question', query: 'What was it that we said about the board and the way they read the reports?', expect: ['learned-pdf'] },
    { category: 'question', query: 'Is there a rule about what to do before an email is sent to the outside?', expect: ['approval'] },

    { category: 'task', query: 'Draft an email to the board with the Q3 report', expect: ['learned-pdf'] },
    { category: 'task', query: 'Book a team lunch for Friday', expect: ['diet'] },
    { category: 'task', query: 'Schedule a sync with the design team next Wednesday at 3pm', expect: ['meetings'] },
    { category: 'task', query: 'Send the proposal to our contact at Norvik', expect: ['approval', 'biggest-customer', 'task-renewal'] },
    { category: 'task', query: 'Pull the last 6 months of product usage data', expect: ['learned-api', 'analytics'] },
    { category: 'task', query: 'Prepare a chart of revenue by region', expect: ['charts'] },
    { category: 'task', query: 'Export all the deals from the CRM', expect: ['learned-export', 'crm'] },
    { category: 'task', query: 'Rédige la réponse au client qui demande à être remboursé', expect: ['refund'] },
    { category: 'task', query: 'Write the announcement for the customers about the next release', expect: ['note-roadmap', 'emoji'] },
    { category: 'task', query: 'What time is it for me right now?', expect: ['timezone'] },

    { category: 'negative', query: 'hello', expect: [] },
    { category: 'negative', query: 'ok go', expect: [] },
    { category: 'negative', query: 'continue', expect: [] },
    { category: 'negative', query: 'yes please', expect: [] },
    { category: 'negative', query: 'merci beaucoup', expect: [] },
    { category: 'negative', query: 'can you make it shorter', expect: [] },
    { category: 'negative', query: 'try again', expect: [] },
    { category: 'negative', query: 'what can you do?', expect: [] },
    { category: 'negative', query: 'translate this sentence into Spanish: the weather is nice', expect: [] },
    { category: 'negative', query: 'what is 17 times 23', expect: [] },
    { category: 'negative', query: 'tell me a joke', expect: [] },
    { category: 'negative', query: 'who won the world cup in 2018', expect: [] },
    { category: 'negative', query: 'perfect, ship it', expect: [] },
    { category: 'negative', query: 'bonjour, ça va ?', expect: [] },
    { category: 'negative', query: 'explain how a binary search works', expect: [] },
    { category: 'negative', query: 'thanks, that is all for today', expect: [] },
    { category: 'negative', query: 'what is the capital of Australia', expect: [] },
    { category: 'negative', query: 'write me a haiku about autumn', expect: [] },
    { category: 'negative', query: 'how do I center a div in CSS', expect: [] },
    { category: 'negative', query: 'ok', expect: [] },
]

export type ReconcileCase = { name: string; seed: SeedMemory[]; write: string; expect: 'new' | { update: string } }

export const RECONCILE_CASES: ReconcileCase[] = [
    { name: 'corrected value', seed: [{ key: 'a', kind: 'fact', content: 'The Growth plan costs 249 euros per month.' }], write: 'The Growth plan now costs 299 euros per month.', expect: { update: 'a' } },
    { name: 'plain restatement', seed: [{ key: 'a', kind: 'fact', content: 'The CEO of Brightloom is Tobias Lindqvist.' }], write: 'Tobias Lindqvist is the chief executive of Brightloom.', expect: { update: 'a' } },
    { name: 'changed owner', seed: [{ key: 'a', kind: 'fact', content: 'Payroll is approved by Marianne Okafor.' }], write: 'Payroll is approved by Daniel Reyes since September.', expect: { update: 'a' } },
    { name: 'reversed preference', seed: [{ key: 'a', kind: 'preference', content: 'The user wants weekly reports on Monday morning.' }], write: 'The user wants weekly reports on Friday afternoon instead of Monday.', expect: { update: 'a' } },
    { name: 'restatement in another language', seed: [{ key: 'a', kind: 'fact', content: 'The fiscal year ends on March 31.' }], write: "L'exercice fiscal se termine le 31 mars.", expect: { update: 'a' } },
    {
        name: 'correction among lookalikes',
        seed: [
            { key: 'a', kind: 'fact', content: 'The Lisbon office has 12 employees.' },
            { key: 'b', kind: 'fact', content: 'The Rotterdam office has 40 employees.' },
            { key: 'c', kind: 'fact', content: 'The Montreal office has 5 employees.' },
        ],
        write: 'The Rotterdam office has grown to 52 employees.',
        expect: { update: 'b' },
    },
    { name: 'same attribute, other entity', seed: [{ key: 'a', kind: 'fact', content: 'The Lisbon office has 12 employees.' }], write: 'The Rotterdam office has 40 employees.', expect: 'new' },
    { name: 'same tool, other fact', seed: [{ key: 'a', kind: 'fact', content: 'The sales team tracks deals in HubSpot.' }], write: 'The HubSpot export fails above 10,000 rows.', expect: 'new' },
    { name: 'same person, other fact', seed: [{ key: 'a', kind: 'fact', content: 'Marianne Okafor approves payroll.' }], write: 'Marianne Okafor is on leave until January 6.', expect: 'new' },
    { name: 'unrelated fact', seed: [{ key: 'a', kind: 'fact', content: 'The backend is written in Elixir.' }], write: 'The customer newsletter goes out on Thursdays.', expect: 'new' },
    { name: 'second preference, same area', seed: [{ key: 'a', kind: 'preference', content: 'The user dislikes pie charts.' }], write: 'The user wants every chart to carry a title and a source line.', expect: 'new' },
    { name: 'other plan, same shape', seed: [{ key: 'a', kind: 'fact', content: 'The Growth plan costs 249 euros per month.' }], write: 'The Starter plan costs 49 euros per month.', expect: 'new' },
]

export type CuratorCase = {
    name: string
    seed: SeedMemory[]
    user: string
    assistant: string
    expect: 'nothing' | 'new' | { update: string } | { obsolete: string }
    mustNotContain?: string
}

export const CURATOR_CASES: CuratorCase[] = [
    { name: 'durable fact', seed: [], user: 'By the way, our fiscal year ends on March 31, keep that in mind for the reports.', assistant: 'Understood, I will align the reporting periods on a March 31 year end.', expect: 'new' },
    { name: 'standing preference', seed: [], user: 'I live in Montreal, so give me times in Eastern Time from now on.', assistant: 'Will do, all times in Eastern Time.', expect: 'new' },
    { name: 'small talk', seed: [], user: 'Thanks, that was quick!', assistant: 'Glad it helped.', expect: 'nothing' },
    { name: 'one-off request', seed: [], user: 'Can you summarise this article in three bullet points? https://example.com/post', assistant: 'Here are the three key points: growth slowed, costs rose, hiring paused.', expect: 'nothing' },
    {
        name: 'work procedure (belongs in a skill)',
        seed: [],
        user: 'When you write the weekly report, always start with the three KPIs, then the risks, then next steps, and keep it under 300 words.',
        assistant: 'Got it, I will follow that structure for the weekly report.',
        expect: 'nothing',
    },
    {
        name: 'format correction (belongs in a skill)',
        seed: [],
        user: 'No, the subject lines you write are too long. Keep them under 6 words and never use a colon.',
        assistant: 'Understood, shorter subject lines without colons.',
        expect: 'nothing',
    },
    { name: 'transient state', seed: [], user: 'I am in a meeting for the next hour, I will read your answer after.', assistant: 'No problem, it will be here when you are back.', expect: 'nothing' },
    {
        name: 'corrects an existing memory',
        seed: [{ key: 'a', kind: 'fact', content: 'The Growth plan costs 249 euros per month.' }],
        user: 'Small update: we raised the Growth plan to 299 euros per month last week.',
        assistant: 'Noted, I will quote 299 euros for the Growth plan.',
        expect: { update: 'a' },
    },
    {
        name: 'contradicts an existing memory',
        seed: [{ key: 'a', kind: 'fact', content: 'The company uses Pipedrive as its CRM.' }],
        user: 'We dropped Pipedrive entirely, everything is in HubSpot now.',
        assistant: 'Understood, I will look in HubSpot from now on.',
        expect: { update: 'a' },
    },
    {
        name: 'already known, nothing new',
        seed: [{ key: 'a', kind: 'fact', content: 'The CEO of Brightloom is Tobias Lindqvist.' }],
        user: 'Remind me, who is our CEO?',
        assistant: 'Your CEO is Tobias Lindqvist.',
        expect: 'nothing',
    },
    {
        name: 'secret pasted in chat',
        seed: [],
        user: 'Here is the Stripe key to use for the export: sk_live_51QxBENCHMARKONLYa8Zt2LmN0pQ',
        assistant: 'Thanks, I ran the export with it.',
        expect: 'nothing',
        mustNotContain: 'sk_live_51QxBENCHMARKONLYa8Zt2LmN0pQ',
    },
    {
        name: 'fact buried in a long task turn',
        seed: [],
        user: 'Draft the renewal email for Norvik Logistics. Their contact is Ingrid Solberg, she is the new head of procurement there since this month.',
        assistant: 'Here is the draft: Dear Ingrid, as your renewal date approaches we wanted to share the updated terms...',
        expect: 'new',
    },
]
