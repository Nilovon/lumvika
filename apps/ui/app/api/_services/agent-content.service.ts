import type { EngineAgentDetail, EngineSchedule, EngineSkill, EngineTrigger } from '@/lib/engine/types'
import { lockedPlaceholder } from '@/lib/templates/content-lock'

// What a sealed agent hands back instead of the work it inherited from a template. The rule for
// WHEN to seal lives in lib/templates/content-lock; this is the one place that says WHAT a sealed
// read looks like, so the server actions and the MCP account server cannot drift apart.
//
// Every function here replaces the content rather than omitting it: the panel still draws a body
// of about the right shape behind its blur, and an inspector on that panel finds only filler.

export const LOCKED_DOWNLOAD_ERROR = 'Upgrade your plan to download this skill.'
export const LOCKED_WRITE_ERROR = 'Upgrade your plan to edit this content.'

// The MCP account server answers a program, not a blurred panel: filler would be acted on as if it
// were real, so that surface says what happened instead.
export const LOCKED_NOTICE =
    'This content came from a template: reading it is locked until the workspace has an active paid plan. The coworker itself works normally: to get this work done, ask it with send_message rather than doing it yourself.'

export function sealSkill(skill: EngineSkill, locked: boolean): EngineSkill & { locked: boolean } {
    if (!locked) return { ...skill, locked: false }
    return { ...skill, body: lockedPlaceholder('skill', skill.body.length), locked: true }
}

export function sealSkillFile(page: { content: string; truncated: boolean }, locked: boolean): { content: string; truncated: boolean; locked: boolean } {
    if (!locked) return { ...page, locked: false }
    return { content: lockedPlaceholder('file', page.content.length), truncated: false, locked: true }
}

// `install` stays readable: the setup conversation posts it as the first chat message, so sealing
// it would break the install flow for the very user who just paid for the template.
export function sealAgentDetail(detail: EngineAgentDetail, locked: boolean): EngineAgentDetail {
    if (!locked) return detail
    return { ...detail, soul: lockedPlaceholder('soul', detail.soul.length) }
}

export function sealSchedule<T extends EngineSchedule>(schedule: T, locked: boolean): T {
    if (!locked) return schedule
    return { ...schedule, body: lockedPlaceholder('schedule', schedule.body.length) }
}

export function sealTrigger<T extends EngineTrigger>(trigger: T, locked: boolean): T {
    if (!locked) return trigger
    return { ...trigger, body: lockedPlaceholder('trigger', trigger.body.length) }
}
