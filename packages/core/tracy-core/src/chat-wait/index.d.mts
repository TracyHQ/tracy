/**
 * Hand-written types for `index.mjs`, kept in sync BY HAND — same arrangement as `../lease`.
 */

export type WaitKind = 'lease' | 'previous' | 'check'

export function beginWait(sessionId: string, kind: WaitKind, now?: number): () => void
export function whileWaiting<T>(
  sessionId: string | null | undefined,
  kind: WaitKind,
  promise: Promise<T>
): Promise<T>
export function waitOf(sessionId: string, now?: number): { kind: WaitKind; seconds: number } | null
