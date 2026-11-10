export function str(args: Record<string, unknown>, key: string): string | undefined {
    return typeof args[key] === 'string' ? (args[key] as string) : undefined
}

export function requireStr(args: Record<string, unknown>, key: string): string {
    const v = str(args, key)
    if (!v) throw new Error(`Missing required argument: ${key}`)
    return v
}

export function strList(args: Record<string, unknown>, key: string): string[] | undefined {
    const v = args[key]
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
    return undefined
}

export function num(args: Record<string, unknown>, key: string): number | undefined {
    return typeof args[key] === 'number' ? (args[key] as number) : undefined
}

export function bool(args: Record<string, unknown>, key: string): boolean | undefined {
    return typeof args[key] === 'boolean' ? (args[key] as boolean) : undefined
}

export function obj(args: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
    const v = args[key]
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

export function objList(args: Record<string, unknown>, key: string): Record<string, unknown>[] | undefined {
    const v = args[key]
    if (!Array.isArray(v)) return undefined
    return v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
}
