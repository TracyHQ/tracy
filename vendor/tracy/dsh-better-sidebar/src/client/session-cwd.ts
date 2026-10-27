/**
 * A session's workspace root, as the client can know it.
 *
 * The client session list is the live source, but its summary may carry no
 * `cwd`: while a session's header is still hydrating, and for a conversation
 * made with New session, whose summary stays without one until the page
 * reloads. Then the host is asked once (`session.cwd`, which falls back to the
 * process cwd), so the explorer root and the git rows are real from first
 * paint instead of showing "no session". A summary cwd, once it arrives, wins.
 *
 * TRACY FORK (TCH R3-1): the shell Sidebar had this fallback inline, but the
 * native tab body (where the Files tab is drawn when DSH hosts the tabs) read
 * the summary only, so Files on a new session showed "Select a conversation to
 * use the sidebar" until a reload. Both read this one hook now.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Context } from '../context-types.ts'
import { api } from './api.ts'

export function useSessionCwd(ctx: Context, sessionId: string | undefined): string | undefined {
  const summaryCwd = useSyncExternalStore(
    useMemo(() => (listener: () => void) => ctx.sessions.list.subscribe(listener), [ctx]),
    () => (sessionId === undefined ? undefined : ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd),
  )
  const [fetched, setFetched] = useState<{ sessionId: string; cwd: string } | undefined>(undefined)
  useEffect(() => {
    if (sessionId === undefined || summaryCwd !== undefined) return
    let cancelled = false
    api.sessionCwd({ sessionId })
      .then(result => { if (!cancelled) setFetched({ sessionId, cwd: result.cwd }) })
      .catch(() => { /* the explorer/git rows surface their own errors */ })
    return () => { cancelled = true }
  }, [sessionId, summaryCwd])
  // An answer about another session never stands in for this one's.
  return summaryCwd ?? (fetched?.sessionId === sessionId ? fetched?.cwd : undefined)
}
