/**
 * [TAM] Temporary developer preview, never ships: remove this file and every line marked [TAM].
 *
 * A floating panel, bottom right, shown only when the address carries `wo-preview=1`: it flips the Details page
 * through its states (`preview-states.ts`) without calling the server. While a preview state is on, every write
 * door of the api is replaced by a toast, so no press reaches the server.
 */
import { type CSSProperties, type JSX, useCallback, useEffect, useMemo, useState } from 'react'

import type { Api } from './api.ts'
import {
  PREVIEW_LABELS,
  PREVIEW_STATES,
  type PreviewStateId,
  isPreviewState,
  previewFlag
} from './preview-states.ts'

const KEY = 'tracy-wo-preview-state'

export interface Preview {
  /** The flag is in the address: the panel shows. */
  flag: boolean
  state: PreviewStateId
  /** A preview state other than Real data is on: presses are blocked. */
  active: boolean
  setState: (state: PreviewStateId) => void
  note: string | null
  notify: (text: string) => void
  /** True (and a toast) when a preview state is on: the caller returns without calling the server. */
  block: (action: string) => boolean
}

function stored(): PreviewStateId {
  try {
    const v = window.sessionStorage.getItem(KEY)
    return isPreviewState(v) ? v : 'real'
  } catch {
    return 'real'
  }
}

export function usePreview(): Preview {
  const [flag] = useState(() =>
    typeof window === 'undefined' ? false : previewFlag(window.location.search, window.location.hash)
  )
  const [state, setRaw] = useState<PreviewStateId>(() => (flag ? stored() : 'real'))
  const [note, setNote] = useState<string | null>(null)
  const setState = useCallback((next: PreviewStateId) => {
    setRaw(next)
    try {
      window.sessionStorage.setItem(KEY, next)
    } catch {
      // Storage refused (private window): the choice lasts until the reload.
    }
  }, [])
  const notify = useCallback((text: string) => setNote(text), [])
  useEffect(() => {
    if (note === null) return
    const timer = setTimeout(() => setNote(null), 2500)
    return () => clearTimeout(timer)
  }, [note])
  const active = flag && state !== 'real'
  const block = useCallback(
    (action: string): boolean => {
      if (!active) return false
      notify(`Preview: ${action}`)
      return true
    },
    [active, notify]
  )
  return { flag, state, active, setState, note, notify, block }
}

/** The doors that only read; every other door is a write and is blocked while a preview state is on. */
const READS = new Set([
  'detail',
  'placeProfile',
  'siteLabel',
  'checkSiteLabel',
  'researchAgainPreview',
  'briefJob',
  'revision',
  'revisionMarkdown',
  'buildStatus',
  'handOffState',
  'capabilities',
  'demoUsage',
  'demoAction',
  'templateRanking',
  'settings',
  'list',
  'listPage',
  'outreach'
])

export function usePreviewApi(api: Api, preview: Preview): Api {
  const { active, notify } = preview
  return useMemo(() => {
    if (!active) return api
    return new Proxy(api, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver)
        if (typeof key !== 'string' || typeof value !== 'function' || READS.has(key)) return value
        return async () => {
          notify(`Preview: ${key}`)
          return { ok: false, status: 0, code: 'PREVIEW_BLOCKED' }
        }
      }
    })
  }, [api, active, notify])
}

const box: CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  zIndex: 2147483000,
  width: 248,
  padding: 12,
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--popover, var(--background))',
  color: 'var(--popover-foreground, var(--foreground))',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  fontSize: 12,
  lineHeight: 1.4
}
const pill: CSSProperties = {
  ...box,
  width: 'auto',
  padding: '6px 12px',
  borderRadius: 999,
  cursor: 'pointer',
  fontWeight: 600
}
const muted: CSSProperties = { color: 'var(--muted-foreground)', margin: '6px 0 0' }

export function PreviewPanel({ preview }: { preview: Preview }): JSX.Element | null {
  const [open, setOpen] = useState(true)
  if (!preview.flag) return null
  const label = PREVIEW_LABELS[preview.state]
  if (!open)
    return (
      <button type="button" style={pill} onClick={() => setOpen(true)} data-wo-preview="pill">
        Preview · {label}
      </button>
    )
  return (
    <div style={box} data-wo-preview="panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong>Preview</strong>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{ border: 0, background: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12 }}
        >
          Collapse
        </button>
      </div>
      <p style={muted}>
        A temporary panel to view each state. It calls no server. Drop wo-preview=1 to remove it.
      </p>
      <fieldset style={{ border: 0, padding: 0, margin: '8px 0 0' }}>
        <legend style={{ fontWeight: 600, padding: 0 }}>State</legend>
        {PREVIEW_STATES.map((id) => (
          <label key={id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0' }}>
            <input
              type="radio"
              name="wo-preview-state"
              value={id}
              checked={preview.state === id}
              onChange={() => preview.setState(id)}
            />
            {PREVIEW_LABELS[id]}
          </label>
        ))}
      </fieldset>
      <p style={muted}>Theme follows the app (switch light or dark there). Width: resize the window.</p>
      {preview.note !== null ? (
        <p role="status" style={{ margin: '8px 0 0', fontWeight: 600, color: 'var(--primary)' }}>
          {preview.note}
        </p>
      ) : null}
    </div>
  )
}
