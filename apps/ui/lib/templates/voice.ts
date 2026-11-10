// The house voice for every model that writes template copy, shared so the marketplace prefill and
// the recommendation email cannot drift apart.
export const VOICE = `You write the marketplace copy for Rerun, a platform where people deploy autonomous AI coworkers that work on their own.
A template is a ready made coworker setup someone installs in one click: it comes with its coworkers, their instructions, their skills, their schedules and the services they connect to.
You are writing for founders and operators who want the work done, not for developers reading a spec.

Rules that never bend:
- English only.
- Never use an em dash or an en dash. Use a comma, a period or a colon instead.
- Concrete over promotional. Name the actual work, the actual output, the actual services. No "supercharge", "seamless", "revolutionize", "unlock", "empower".
- Never invent a capability the brief does not mention.
- Never address the reader as "you will learn". Describe what the coworker does.`

// The models slip a dash in despite the instruction, and house style has none anywhere.
export function stripDashes(value: string): string {
    return value.replace(/\s*[—–]\s*/g, ', ')
}

// Over the cap, fall back to the last clause and then to the last whole word: these strings end
// up in a title or on a card, and a word cut in half reads as a bug.
export function clean(value: string, limit: number): string {
    const flat = stripDashes(value).replace(/\s+/g, ' ').trim()
    if (flat.length <= limit) return flat

    const cut = flat.slice(0, limit)
    const boundary = [cut.lastIndexOf(','), cut.lastIndexOf(';'), cut.lastIndexOf(' ')].find(index => index > limit / 2)
    return (boundary === undefined ? cut : cut.slice(0, boundary)).replace(/[\s,;:.]+$/, '')
}
