'use client'

import type { ReactNode } from 'react'

import { type ToolPartLike, UnderText } from '@/components/chat/MessageView'
import { isForemanWidgetTool } from '@/lib/foreman/tool-defs'
import { isAgentShortcutTool, shortcutPicks, type AgentPick } from './agent-picks'
import { AgentPickerCard } from './AgentPickerCard'
import { CheckoutWidget, TemplatePurchaseWidget } from '@rerun/cloud/billing.client'
import { ContactTeamWidget } from './ContactTeamWidget'
import { ForemanEitherWidget } from './ForemanEitherWidget'
import { ForemanQuestionWidget } from './ForemanQuestionWidget'
import { PlanCardWidget } from './PlanCardWidget'
import { StarterPackWidget } from './starter-pack/StarterPackWidget'
import { TemplateChoiceWidget } from './TemplateChoiceWidget'

// The foreman's half of MessageView's `renderToolPart`. `undefined` means "not mine", so every
// other tool keeps its normal collapsed step.
export type AnswerWidget = (toolName: string, toolCallId: string, output: unknown) => void
export type DismissWidget = (toolCallId: string) => void
// From planAgentShortcuts: the rows a shortcut call draws once its message is folded, null when an
// earlier call of the same message already draws them.
export type AgentShortcutPlan = Map<string, AgentPick[] | null>

export function renderForemanWidget(part: ToolPartLike, answer: AnswerWidget, dismiss?: DismissWidget, shortcuts?: AgentShortcutPlan): ReactNode | undefined {
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
    if (!isForemanWidgetTool(part.toolName)) return undefined
    // A call that errored out server side has nothing to render and nothing to answer.
    if (part.state === 'output-error') return undefined

    const onAnswer = (output: unknown) => answer(part.toolName, part.toolCallId, output)

    switch (part.toolName) {
        case 'ask_choice':
        case 'ask_input':
            return <ForemanQuestionWidget input={part.input} output={part.output} onAnswer={onAnswer} onDismiss={dismiss && (() => dismiss(part.toolCallId))} />
        case 'ask_either':
            return <ForemanEitherWidget input={part.input} output={part.output} onAnswer={onAnswer} />
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
