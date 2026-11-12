'use client'

import type { WorkMemberRef } from '@lumvika/contracts'
import { useCallback, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type SyntheticEvent } from 'react'

import type { ChannelDirectory } from '@/components/channels/useChannelDirectory'
import type { ComposerMention } from '@/lib/chat/composer-links'

// Who `@` offers in a channel: its members, people and coworkers, and the coworkers of the board the
// person reaches (mentioning one that is not in the channel offers to add it). Each is written as a
// one-word label, the first name of a person or the handle of a coworker, which is also how the
// message is read back for the mentions it carries.

export type MentionCandidate = { ref: WorkMemberRef; label: string; name: string; hint?: string }

const LABEL_END = '(?=$|[\\s.,;:!?)\\]}\'"])'

function labelWord(text: string): string {
    return text.trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '')
}

export function mentionCandidates(directory: ChannelDirectory, memberRefs: readonly WorkMemberRef[], fallbackPersonName: string): MentionCandidate[] {
    const people = memberRefs.flatMap(ref => (ref.kind === 'user' ? [ref.userId] : []))
    const agentIds = new Set([...memberRefs.flatMap(ref => (ref.kind === 'agent' ? [ref.agentId] : [])), ...directory.coworkers.filter(coworker => coworker.reachable).map(coworker => coworker.id)])

    const personEntries = people.map(userId => {
        const name = directory.person(userId)?.name ?? fallbackPersonName
        return { ref: { kind: 'user' as const, userId }, name, first: labelWord(name.split(' ')[0] ?? name) || 'teammate', full: labelWord(name) || 'teammate' }
    })
    const firstCounts = new Map<string, number>()
    for (const entry of personEntries) firstCounts.set(entry.first.toLowerCase(), (firstCounts.get(entry.first.toLowerCase()) ?? 0) + 1)

    const candidates: MentionCandidate[] = personEntries.map(entry => ({ ref: entry.ref, name: entry.name, label: (firstCounts.get(entry.first.toLowerCase()) ?? 0) > 1 ? entry.full : entry.first }))
    for (const agentId of agentIds) {
        const coworker = directory.coworker(agentId)
        if (!coworker) continue
        candidates.push({ ref: { kind: 'agent', agentId }, name: coworker.name, label: coworker.handle || labelWord(coworker.name) || 'coworker', hint: coworker.handle ? `@${coworker.handle}` : undefined })
    }
    return candidates
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The candidates a text mentions, each as its member reference.
export function mentionsIn(text: string, candidates: readonly MentionCandidate[]): WorkMemberRef[] {
    return candidates.filter(candidate => new RegExp(`(?<=^|\\s)@${escapeRegExp(candidate.label)}${LABEL_END}`, 'i').test(text)).map(candidate => candidate.ref)
}

export function mentionTokens(candidates: readonly MentionCandidate[]): ComposerMention[] {
    return candidates.map(candidate => ({ text: `@${candidate.label}`, kind: 'agent' }))
}

// The tokens a sent message draws: each label as written here, and as the text spells it (`@echo`
// for `@Echo`), since a mention is read back whatever its case.
export function mentionTokensIn(body: string, candidates: readonly MentionCandidate[]): ComposerMention[] {
    const tokens = mentionTokens(candidates)
    const known = new Set(tokens.map(token => token.text))
    for (const candidate of candidates) {
        for (const match of body.matchAll(new RegExp(`(?<=^|\\s)@${escapeRegExp(candidate.label)}${LABEL_END}`, 'gi'))) {
            if (known.has(match[0])) continue
            known.add(match[0])
            tokens.push({ text: match[0], kind: 'agent' })
        }
    }
    return tokens
}

type MentionState = { query: string; start: number }

export function useChannelMentions(candidates: MentionCandidate[], onValueChange?: (text: string) => void) {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const [mention, setMention] = useState<MentionState | null>(null)
    const [highlight, setHighlight] = useState(0)

    const items = useMemo(() => {
        if (!mention) return []
        const query = mention.query.toLowerCase()
        return candidates
            .filter(candidate => [candidate.name, candidate.label].some(field => field.toLowerCase().includes(query)))
            .sort((a, b) => Number(a.ref.kind === 'agent') - Number(b.ref.kind === 'agent') || a.name.localeCompare(b.name))
            .slice(0, 30)
    }, [candidates, mention])

    const tokens = useMemo(() => mentionTokens(candidates), [candidates])
    const open = mention !== null && items.length > 0

    const detect = useCallback((el: HTMLTextAreaElement) => {
        const caret = el.selectionStart ?? 0
        const match = el.value.slice(0, caret).match(/(^|\s)@([\p{L}\p{N}_-]*)$/u)
        setMention(match ? { query: match[2], start: caret - match[2].length - 1 } : null)
        setHighlight(0)
    }, [])

    const pick = useCallback(
        (candidate: MentionCandidate) => {
            const el = inputRef.current
            if (!el || !mention) return
            const caret = el.selectionStart ?? 0
            const inserted = `@${candidate.label} `
            el.value = el.value.slice(0, mention.start) + inserted + el.value.slice(caret)
            const position = mention.start + inserted.length
            el.setSelectionRange(position, position)
            el.focus()
            setMention(null)
            onValueChange?.(el.value)
        },
        [mention, onValueChange]
    )

    const onKeyDown = useCallback(
        (e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (!open) return
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlight(h => (h + 1) % items.length)
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlight(h => (h - 1 + items.length) % items.length)
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                pick(items[highlight])
            } else if (e.key === 'Escape') {
                e.preventDefault()
                setMention(null)
            }
        },
        [open, items, highlight, pick]
    )

    const textareaProps = useMemo(
        () => ({
            onChange: (e: ChangeEvent<HTMLTextAreaElement>) => detect(e.currentTarget),
            onSelect: (e: SyntheticEvent<HTMLTextAreaElement>) => detect(e.currentTarget),
            onKeyDown,
        }),
        [detect, onKeyDown]
    )

    return { inputRef, open, items, highlight, setHighlight, pick, tokens, textareaProps }
}
