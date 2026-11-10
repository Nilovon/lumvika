import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sanitizeIdentifier(value: string, opts: { allowHyphen?: boolean } = {}): string {
  const allowed = opts.allowHyphen ? 'a-z0-9_-' : 'a-z0-9_'
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(new RegExp(`[^${allowed}]`, 'g'), '_')
    .replace(/^(\d)/, '_$1')
    .replace(/__+/g, '_')
}
