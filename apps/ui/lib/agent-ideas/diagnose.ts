import { z } from 'zod'

import { evidenceForPrompt } from './evidence'
import { generateIdeasObject } from './model'
import { LENSES, type CompanyDossier, type Opportunity } from './types'

const diagnosisSchema = z.object({
    opportunities: z
        .array(
            z.object({
                job: z.string().describe('One piece of recurring work at this company, as a plain sentence naming the real things involved'),
                lens: z.enum(LENSES),
                who: z.string().describe('Who most likely does it today, from the evidence: a role, or "nobody" when it is left undone'),
                cadence: z.string().describe('How often it comes up, or what sets it off'),
                tool: z.string().describe('The app it happens in according to the evidence, empty if none is named'),
                friction: z.string().describe('What it costs them today: time, delay, missed revenue, or work simply not done'),
                evidenceIds: z.array(z.string()).describe('Ids of the facts that show this work exists here, e.g. ["E4","E17"]'),
            })
        )
        .min(6)
        .max(16),
})

const SYSTEM = `You are an operations analyst mapping how one specific company actually runs, from a numbered list of facts collected about it.

You are not proposing anything yet. You are finding the recurring work: tasks that come back every day, week or month, or every time something happens, and that somebody has to do by hand.

How to look:
- Go function by function: acquisition, sales, delivery of the product or service, customer support, back office, watching the market, content. Skip a function the facts say nothing about.
- Start from what makes this company unlike its neighbours: what it sells and how, who buys it, which named competitors it faces, which apps it runs on, the role of the person who signed up, what they said goes wrong.
- A job counts only if a fact supports it. Cite the ids. A job you could write without reading the facts is not worth listing.
- Prefer the narrow job to the broad one: "answer the sizing questions that come before every order of the custom range" over "handle customer support".
- The job they already asked to hand over is taken: do not list it again, look at what surrounds it.

Write in English, plainly, with the company's own names for its products, customers and tools.`

function prompt(dossier: CompanyDossier): string {
    return [`Company: ${dossier.companyName ?? 'unknown name'}`, dossier.existingAgents.length ? `Coworkers they already have:\n${dossier.existingAgents.map(agent => `- ${agent.name}: ${agent.description}`).join('\n')}` : 'They have no coworker yet.', `Facts:\n${evidenceForPrompt(dossier.evidence)}`].join('\n\n')
}

export async function diagnose(dossier: CompanyDossier) {
    const { object, cost } = await generateIdeasObject({ schema: diagnosisSchema, system: SYSTEM, prompt: prompt(dossier) })
    return { opportunities: object.opportunities satisfies Opportunity[], cost }
}
