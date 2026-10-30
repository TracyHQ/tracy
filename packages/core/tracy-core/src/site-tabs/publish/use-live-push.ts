/**
 * Sync to live as state (plan tasks/ke-hoach-sync-to-live.md): the Owner of an imported site sends the
 * changes Tracy made on this copy to their live site. The doors are `GET /api/sites/:key/push`,
 * `POST …/push/preview`, `POST …/push` and `POST …/push/:id/undo`
 * (`apps/tracy-web/src/sites/live-push.js`).
 *
 * The logic of the dialog that sat in `@tracy/dsh-my-sites` (`live-push-panel.tsx`), moved here
 * unchanged when Sync to live became a flow of the Publish tab (25/10/2026): the same doors, asked at
 * the same moments, with the same answers followed. `PushStep` draws what this returns. Nothing on the
 * live site changes before Confirm, and a removal or a PHP file goes only with its own tick.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { announceSiteSynced } from '../../turn-undo/index.mjs'
import { type PushAnswer, type PushPhase, type PushView, pushPhaseOf, pushableOf } from './push-words'

const POLL_MS = 3000

export interface LivePush {
  phase: PushPhase
  answer: PushAnswer | null
  push: PushView | null
  /** The door could not be read: its code. */
  unreadable: string
  /** A press the door refused: its code (said beside the phase, the phase kept). */
  error: string
  /** A press is on its way. */
  pressed: boolean
  /** A preview, a push or an undo is under way on the host. */
  running: boolean
  /** The removals go too (their own tick); PHP files go too (theirs). */
  ticked: boolean
  phpTicked: boolean
  setTicked: (on: boolean) => void
  setPhpTicked: (on: boolean) => void
  /** Undo was pressed once: it asks again before it writes the live site. */
  askUndo: boolean
  setAskUndo: (on: boolean) => void
  /** The newest push that can still be undone, the one on screen or the last one. */
  undoTarget: PushView | null
  /** Changes that go at Confirm: added, changed (files, settings and ticked PHP with them), removed. */
  counts: { total: number; add: number; change: number; remove: number }
  max: number
  load: () => void
  preview: () => void
  /** Review → Confirm, and back. */
  toConfirm: () => void
  backToReview: () => void
  confirm: () => void
  undo: () => void
}

async function call(path: string, init?: RequestInit): Promise<{ ok: boolean; body: any }> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) },
    ...init
  })
  return { ok: response.ok, body: await response.json().catch(() => ({})) }
}

/** `enabled` false asks no door: the flow is not on screen. */
export function useLivePush({ siteKey, enabled = true }: { siteKey: string; enabled?: boolean }): LivePush {
  const base = `/api/sites/${encodeURIComponent(siteKey)}/push`
  const [answer, setAnswer] = useState<PushAnswer | null>(null)
  const [unreadable, setUnreadable] = useState('')
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [askUndo, setAskUndo] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [ticked, setTicked] = useState(false)
  const [phpTicked, setPhpTicked] = useState(false)
  // The phase this flow started, by push id: its end reloads the site's open previews (the host
  // syncs from live after a push, so the copy may change).
  const mine = useRef<string | null>(null)

  const read = useCallback(async (): Promise<PushAnswer> => {
    const { ok, body } = await call(base)
    if (!ok) throw new Error(body?.code ?? 'PUSH_FAILED')
    setUnreadable('')
    setAnswer(body as PushAnswer)
    return body as PushAnswer
  }, [base])

  const load = useCallback(() => {
    read().catch((e: unknown) => setUnreadable(e instanceof Error ? e.message : 'PUSH_FAILED'))
  }, [read])
  useEffect(() => {
    if (enabled) load()
  }, [enabled, load])

  const push = answer?.push ?? null
  const phase = pushPhaseOf(answer, { unreadable: Boolean(unreadable), confirming })
  const running = phase === 'previewing' || phase === 'pushing' || phase === 'undoing'

  // Follow a running phase; say on the page when one started here ended in place.
  useEffect(() => {
    if (!push || !enabled) return
    if (push.state === 'running') {
      const timer = setTimeout(() => void read().catch(() => {}), POLL_MS)
      return () => clearTimeout(timer)
    }
    if (mine.current === push.id && (push.state === 'pushed' || push.state === 'undone')) {
      mine.current = null
      announceSiteSynced({ siteKey, syncId: push.id })
    }
    return undefined
  }, [push, read, siteKey, enabled])

  // A new preview starts with no removal ticked (plan §3: a removal needs its own tick).
  const previewId = push?.state === 'previewed' ? push.id : null
  useEffect(() => {
    setTicked(false)
    setPhpTicked(false)
    setConfirming(false)
  }, [previewId])

  const post = useCallback(
    (path: string, body?: unknown) => {
      setError('')
      setPressed(true)
      void (async () => {
        const { ok, body: said } = await call(path, {
          method: 'POST',
          ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        })
        setPressed(false)
        if (!ok) {
          setError(said?.code ?? 'PUSH_FAILED')
          setConfirming(false)
          void read().catch(() => {})
          return
        }
        mine.current = said?.push?.id ?? null
        setConfirming(false)
        setAskUndo(false)
        void read().catch(() => {})
      })()
    },
    [read]
  )

  const v = push?.preview ?? null
  // Over the whole changeset, not only the items the preview lists.
  const n = v ? pushableOf(v) : null
  const removals = ticked ? (n?.remove ?? 0) : 0
  const phpFiles = phpTicked ? (n?.php ?? 0) : 0
  // Files and settings are changes too (the confirm line counts them with the changed records).
  const changed = (n?.change ?? 0) + (n?.files ?? 0) + (n?.settings ?? 0) + phpFiles
  const add = n?.add ?? 0
  const undoTarget = push?.undoable ? push : answer?.lastPush?.undoable ? answer.lastPush : null

  return {
    phase,
    answer,
    push,
    unreadable,
    error,
    pressed,
    running,
    ticked,
    phpTicked,
    setTicked,
    setPhpTicked,
    askUndo,
    setAskUndo,
    undoTarget,
    counts: { total: add + changed + removals, add, change: changed, remove: removals },
    max: push?.maxItems ?? 200,
    load,
    preview: () => post(`${base}/preview`),
    toConfirm: () => setConfirming(true),
    backToReview: () => setConfirming(false),
    confirm: () => {
      if (push) post(base, { previewId: push.id, confirm: { deletes: ticked, php: phpTicked } })
    },
    undo: () => {
      if (undoTarget) post(`${base}/${encodeURIComponent(undoTarget.id)}/undo`)
    }
  }
}
