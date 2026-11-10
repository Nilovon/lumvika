const IPV6_GROUPS = 8
const IPV6_NETWORK_GROUPS = 4

// The reverse proxy in front of the app (Traefik, under Dokploy) writes x-real-ip itself, where the first entry of x-forwarded-for is whatever the
// caller sent.
export function callerIp(headers: Headers): string {
    return headers.get('x-real-ip')?.trim() || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

// What a caller is counted under. One subscriber holds a whole IPv6 /64 and can change address
// inside it at every request, so an IPv6 caller is counted by its network.
export function callerRateKey(ip: string): string {
    if (!ip.includes(':')) return ip
    if (ip.includes('.')) return ip.slice(ip.lastIndexOf(':') + 1)

    const [head, tail] = ip.toLowerCase().split('::')
    const leading = head ? head.split(':') : []
    const trailing = tail ? tail.split(':') : []
    const elided = tail === undefined ? 0 : Math.max(0, IPV6_GROUPS - leading.length - trailing.length)
    const groups = [...leading, ...Array<string>(elided).fill('0'), ...trailing]
    return `${groups.slice(0, IPV6_NETWORK_GROUPS).join(':')}::/64`
}
