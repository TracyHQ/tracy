/**
 * Hand-written types for `index.mjs`, kept in sync BY HAND — same arrangement as `../site-dir`.
 */

export const HEARTBEAT_MS: number
export const DRAIN_STALE_MS: number

export interface LeaseInfo {
  /** What kind of work: `import`, `build`, `chat`. The deploy log names it. */
  kind: string
  siteKey: string
  step?: string
  /** The chat session the work belongs to, when there is one. */
  sessionId?: string
}

export interface Lease {
  update(patch: Partial<LeaseInfo>): void
  release(): void
}

export function draining(now?: number): boolean

export function holdLease(id: string, info: LeaseInfo): Lease
