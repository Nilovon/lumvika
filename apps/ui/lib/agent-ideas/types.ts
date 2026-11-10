import type { CollectorCost } from '@/lib/company/explore/types'

// Client-safe vocabulary of the agent suggestions: the lab page reads it, the pipeline writes it.

// One thing we know about the company, small enough to be cited on its own. Everything the pipeline
// reasons from is a list of these, so a new source of knowledge (a scraper, an import) only has to
// produce more of them: nothing downstream knows where a fact came from beyond its `source` label.
export type Evidence = { id: string; source: string; topic: string; text: string }

export type EvidenceDraft = Omit<Evidence, 'id'>

export type ExistingAgent = { name: string; description: string }

export type CompanyDossier = {
    workspaceId: number
    companyName: string | null
    evidence: Evidence[]
    existingAgents: ExistingAgent[]
    warnings: string[]
}

export const LENSES = ['acquisition', 'sales', 'delivery', 'support', 'backoffice', 'watch', 'content'] as const
export type Lens = (typeof LENSES)[number]

// A piece of recurring work found in the company, before anyone decided an agent should do it.
export type Opportunity = {
    job: string
    lens: Lens
    who: string
    cadence: string
    tool: string
    friction: string
    evidenceIds: string[]
}

// What the design step writes: catalog slugs and evidence ids are still the model's word.
export type AgentCandidate = {
    name: string
    role: string
    hook: string
    lens: Lens
    evidenceIds: string[]
    steps: string[]
    when: string
    connectors: string[]
    missingApps: string[]
    firstRun: string
    kickoff: string
}

export type CatalogApp = { slug: string; name: string; category: string; summary: string; icon: string | null }

export type IdeaConnector = Pick<CatalogApp, 'slug' | 'name' | 'category' | 'icon'>

// A candidate whose every citation and every app has been checked against what really exists.
export type GroundedCandidate = Omit<AgentCandidate, 'evidenceIds' | 'connectors'> & {
    evidence: Evidence[]
    connectors: IdeaConnector[]
}

export type DroppedCandidate = { name: string; role: string; reason: string }

export type GroundResult = { grounded: GroundedCandidate[]; dropped: DroppedCandidate[] }

export const CRITERIA = ['specificity', 'evidence', 'feasibility', 'value', 'novelty'] as const
export type Criterion = (typeof CRITERIA)[number]

// `score` runs from 0 to 1 across the levels of the criterion, `level` is the level that score reads as.
export type CriterionScore = { score: number; level: number; confidence: number }

export type JudgedCandidate = GroundedCandidate & { scores: Record<Criterion, CriterionScore> }

export type Verdict = { keep: boolean; weakest: Criterion; reason: string }

export type AgentIdea = JudgedCandidate & { total: number; verdict: Verdict }

// `kept` is the short list a person reads in one go. `eligible` is every idea that holds every floor,
// best first, whether or not the caps let it through: split across the Boxes of a board, the short
// list alone would leave most of them with nothing to offer.
export type Selection = { kept: AgentIdea[]; rejected: AgentIdea[]; eligible: AgentIdea[] }

export const SUGGEST_STEPS = ['dossier', 'diagnose', 'design', 'ground', 'judge', 'select'] as const
export type SuggestStep = (typeof SUGGEST_STEPS)[number]

export type StepData = {
    dossier: CompanyDossier
    diagnose: Opportunity[]
    design: AgentCandidate[]
    ground: GroundResult
    judge: JudgedCandidate[]
    select: Selection
}

export type StepOutput<K extends SuggestStep = SuggestStep> = { data: StepData[K]; highlights: string[]; cost?: CollectorCost }

export type SuggestEvent = { type: 'running'; step: SuggestStep } | { [K in SuggestStep]: { type: 'done'; step: K; durationMs: number; output: StepOutput<K> } }[SuggestStep] | { type: 'error'; step: SuggestStep; durationMs: number; error: string } | { type: 'end'; durationMs: number }

export const STEP_CATALOG: Record<SuggestStep, { label: string; description: string }> = {
    dossier: { label: 'Dossier', description: 'Brain, trouvailles et réponses d’onboarding, aplatis en preuves numérotées' },
    diagnose: { label: 'Diagnostic', description: 'Le travail récurrent de cette entreprise, fonction par fonction' },
    design: { label: 'Conception', description: 'Un coworker candidat par opportunité, avec ses apps et son premier run' },
    ground: { label: 'Ancrage', description: 'Preuves et apps vérifiées contre le dossier et le catalogue, sans modèle' },
    judge: { label: 'Jury', description: 'Jev note chaque candidat sur cinq critères' },
    select: { label: 'Sélection', description: 'Planchers, diversité des fonctions, cinq idées au plus' },
}
