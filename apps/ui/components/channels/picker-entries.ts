import type { WorkMemberRef } from '@lumvika/contracts'

import type { DirectoryPerson } from '@/components/channels/useChannelDirectory'

export type PickerEntry = { ref: WorkMemberRef; name: string; hint?: string }

// The people to pick from. Two who share a name are told apart by their email.
export function personEntries(people: readonly DirectoryPerson[], unnamed: string, excludeId?: string | null): PickerEntry[] {
    const shown = people.filter(person => person.id !== excludeId).map(person => ({ person, name: person.name ?? unnamed }))
    const counts = new Map<string, number>()
    for (const { name } of shown) counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) ?? 0) + 1)
    return shown.map(({ person, name }) => ({ ref: { kind: 'user' as const, userId: person.id }, name, hint: (counts.get(name.toLowerCase()) ?? 0) > 1 ? (person.email ?? undefined) : undefined }))
}
