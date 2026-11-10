'use client'

import type { ReactNode } from 'react'

import { type ToolPartLike, UnderText } from '@/components/chat/MessageView'
import { isStewardWidgetTool } from '@/lib/steward/tool-defs'
import { isAgentShortcutTool, shortcutPicks, type AgentPick } from './agent-picks'
import { AgentPickerCard } from './AgentPickerCard'
import { CheckoutWidget, TemplatePurchaseWidget } from '@lumvika/cloud/billing.client'
import { ContactTeamWidget } from './ContactTeamWidget'
import { StewardEitherWidget } from './StewardEitherWidget'
import { StewardQuestionWidget } from './StewardQuestionWidget'
import { PlanCardWidget } from './PlanCardWidget'
import { StarterPackWidget } from './starter-pack/StarterPackWidget'
import { TemplateChoiceWidget } from './TemplateChoiceWidget'

// The steward's half of MessageView's `renderToolPart`. `undefined` means "not mine", so every
// other tool keeps its normal collapsed step.
export type AnswerWidget = (toolName: string, toolCallId: string, output: unknown) => void
export type DismissWidget = (toolCallId: string) => void
// From planAgentShortcuts: the rows a shortcut call draws once its message is folded, null when an
// earlier call of the same message already draws them.
export type AgentShortcutPlan = Map<string, AgentPick[] | null>

export function renderStewardWidget(part: ToolPartLike, answer: AnswerWidget, dismiss?: DismissWidget, shortcuts?: AgentShortcutPlan): ReactNode | undefined {
    // Not a widget: it asks nothing and never holds the conversation, it only leaves a shortcut.
    if (isAgentShortcutTool(part.toolName)) {
        if (part.state === 'output-error') return undefined
        const planned = shortcuts?.get(part.toolCallId)
        if (planned === null) return null
        const picks = planned ?? shortcutPicks(part.toolName, part.input)
        return (
            <UnderText>
                <AgentPickerCard picks={picks} />
            </UnderText>
        )
    }
    if (!isStewardWidgetTool(part.toolName)) return undefined
    // A call that errored out server side has nothing to render and nothing to answer.
    if (part.state === 'output-error') return undefined

    const onAnswer = (output: unknown) => answer(part.toolName, part.toolCallId, output)

    switch (part.toolName) {
        case 'ask_choice':
        case 'ask_input':
            return <StewardQuestionWidget input={part.input} output={part.output} onAnswer={onAnswer} onDismiss={dismiss && (() => dismiss(part.toolCallId))} />
        case 'ask_either':
            return <StewardEitherWidget input={part.input} output={part.output} onAnswer={onAnswer} />
        case 'open_checkout':
            return <CheckoutWidget output={part.output} onDone={onAnswer} />
        case 'contact_team':
            return <ContactTeamWidget input={part.input} output={part.output} onAnswer={onAnswer} />
        case 'open_template_purchase':
            return <TemplatePurchaseWidget input={part.input} output={part.output} onDone={onAnswer} />
        case 'show_templates':
            return <TemplateChoiceWidget input={part.input} output={part.output} onAnswer={onAnswer} />
        case 'show_starter_pack':
            return <StarterPackWidget input={part.input} output={part.output} onAnswer={onAnswer} />
        case 'show_plan':
            return <PlanCardWidget input={part.input} output={part.output} streaming={part.state === 'input-streaming'} onAnswer={onAnswer} />
    }
}
