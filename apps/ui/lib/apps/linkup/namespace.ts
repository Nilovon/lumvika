// Which environment a Linkup account belongs to, written into its account_name at creation. The
// daily reconciliation deletes the orphans of its own namespace and leaves the others alone.
export function linkupNamespace(): string {
    return process.env.LINKUP_NAMESPACE || 'local'
}

export function inNamespace(accountName: string | null | undefined, namespace = linkupNamespace()): boolean {
    return !!accountName && accountName.startsWith(`${namespace}:`)
}
