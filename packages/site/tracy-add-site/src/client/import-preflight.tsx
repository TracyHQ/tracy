/** Read-only import checks. Old servers may omit checks; absent evidence never becomes a green row. */
import { tracyWebFetch } from '@tracy/core/web-path'
import { cn } from '@tracy/ui'
import { CheckCircle2, CircleX, Info, Loader2, TriangleAlert } from 'lucide-react'
import { type JSX, useEffect, useState } from 'react'
import { dshUrl } from './dsh-url'
import type { Translate } from './strings'
import { safeImportJoinPath } from './import'

export interface AddressDetection {
  platform?: string | null
  reachable?: boolean
  secure?: boolean | null
  blocked?: boolean
  status?: number
  error?: string
  firewall?: string
  admin?: { signInFound: boolean | null; locked: boolean; basicAuthRequired: boolean }
}
export interface AddressOwnership {
  ownership: 'available' | 'mine' | 'other'
  joinPath?: string
}
export interface PreflightResult {
  detection: AddressDetection | null
  ownership?: AddressOwnership | null
  pending?: boolean
  unavailable?: boolean
}
export interface PreflightRow {
  key: string
  state: 'ok' | 'warning' | 'error' | 'info' | 'pending'
  problem?: string
}
export interface PreflightVerdict {
  rows: PreflightRow[]
  problem?: string
  blocked: boolean
  mine?: boolean
  basic?: boolean
}

/** Detect is a GET performed by the host, with no account details or site writes. */
export async function checkImportAddress(
  siteKey: string,
  adminUrl?: string,
  platform?: string
): Promise<AddressDetection | null> {
  try {
    const response = await fetch(dshUrl('/api/tracy-add-site/detect'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteKey, ...(adminUrl ? { adminUrl } : {}), ...(platform ? { platform } : {}) })
    })
    if (!response.ok) return null
    const body = await response.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

/** The ownership door never reserves an address. An old server's 404 means this row is unavailable. */
export async function checkImportOwnership(siteKey: string): Promise<AddressOwnership | null> {
  try {
    const response = await tracyWebFetch(`/api/sites/import-address?siteKey=${encodeURIComponent(siteKey)}`)
    if (!response.ok) return null
    const body = await response.json()
    if (!['available', 'mine', 'other'].includes(body?.ownership)) return null
    return {
      ownership: body.ownership,
      ...(safeImportJoinPath(body.joinPath) ? { joinPath: safeImportJoinPath(body.joinPath) } : {})
    }
  } catch {
    return null
  }
}

/** Rows stop at the first proven failure. Platform guesses remain warnings. */
export function sitePreflight(result: PreflightResult, platform: string): PreflightVerdict {
  const rows: PreflightRow[] = []
  const d = result.detection
  const fail = (key: string, problem: string): PreflightVerdict => ({
    rows: [...rows, { key, state: 'error', problem }],
    problem,
    blocked: true
  })
  if (!d)
    return result.pending
      ? { rows: [{ key: 'online', state: 'pending' }], blocked: true }
      : { rows: [], problem: result.unavailable ? 'preflight.unavailable' : undefined, blocked: false }
  if (d.reachable === false)
    return fail('online', d.error === 'ENOTFOUND' || d.error === 'EAI_AGAIN' ? 'pf1.dns' : 'pf1.timeout')
  if (d.reachable === true) rows.push({ key: 'online', state: 'ok' })
  if (d.secure === false) return fail('secure', 'pf1.tls')
  if (d.secure === true) rows.push({ key: 'secure', state: 'ok' })
  if (d.blocked === true)
    return fail(
      'firewall',
      d.firewall === 'wordfence' ? 'pf1.wordfence' : d.firewall === 'cloudflare' ? 'p16' : 'firewall'
    )
  if (d.blocked === false)
    rows.push({
      key: 'firewall',
      state: d.firewall === 'cloudflare' ? 'warning' : 'ok',
      ...(d.firewall === 'cloudflare' ? { problem: 'pf1.cloudflare' } : {})
    })
  if (d.platform === platform) rows.push({ key: 'platform', state: 'ok' })
  else rows.push({ key: 'platform', state: 'warning', problem: d.platform ? 'pf1.mismatch' : 'pf1.unknown' })
  const own = result.ownership
  if (own?.ownership === 'other') return fail('ownership', 'pf1.taken')
  if (own?.ownership === 'mine')
    return {
      rows: [...rows, { key: 'ownership', state: 'info', problem: 'pf1.mine' }],
      problem: 'pf1.mine',
      blocked: true,
      mine: true
    }
  if (own?.ownership === 'available') rows.push({ key: 'ownership', state: 'ok' })
  else if (result.pending) rows.push({ key: 'ownership', state: 'pending' })
  return { rows, problem: rows.find((row) => row.problem)?.problem, blocked: !!result.pending }
}

export function adminPreflight(result: PreflightResult, platform: string): PreflightVerdict {
  const d = result.detection
  if (!d)
    return result.pending
      ? { rows: [{ key: 'admin_online', state: 'pending' }], blocked: true }
      : { rows: [], blocked: false }
  const rows: PreflightRow[] = []
  const fail = (key: string, problem: string): PreflightVerdict => ({
    rows: [...rows, { key, state: 'error', problem }],
    problem,
    blocked: true
  })
  if (d.reachable === false) return fail('admin_online', 'pf2.unreachable')
  if (d.secure === false) return fail('admin_online', 'pf1.tls')
  if (d.reachable === true) rows.push({ key: 'admin_online', state: 'ok' })
  if (d.blocked)
    return fail(
      'admin_form',
      d.firewall === 'cloudflare' ? 'p16' : d.firewall === 'wordfence' ? 'p17' : 'firewall'
    )
  if (!d.admin) return { rows, blocked: false }
  if (d.admin.basicAuthRequired)
    return {
      rows: [...rows, { key: 'admin_form', state: 'warning', problem: 'pf2.basic' }],
      problem: 'pf2.basic',
      blocked: false,
      basic: true
    }
  if (d.admin.locked) return fail('admin_form', 'pf2.gate')
  if (d.admin.signInFound === false)
    return fail('admin_form', platform === 'wordpress' ? 'preflight.wp_noform' : 'pf2.noform')
  if (d.admin.signInFound === true) rows.push({ key: 'admin_form', state: 'ok' })
  if (d.admin.signInFound === true && d.admin.locked === false)
    rows.push({ key: 'admin_unlocked', state: 'ok' })
  return { rows, blocked: false }
}

export function PreflightIcon({
  verdict,
  pending
}: {
  verdict: PreflightVerdict
  pending?: boolean
}): JSX.Element | null {
  const state = pending
    ? 'pending'
    : verdict.rows.some((row) => row.state === 'error')
      ? 'error'
      : verdict.rows.some((row) => row.state === 'warning')
        ? 'warning'
        : verdict.rows.some((row) => row.state === 'info')
          ? 'info'
          : verdict.rows.length
            ? 'ok'
            : null
  if (!state) return null
  const Icon =
    state === 'pending'
      ? Loader2
      : state === 'error'
        ? CircleX
        : state === 'warning'
          ? TriangleAlert
          : state === 'info'
            ? Info
            : CheckCircle2
  return (
    <Icon
      aria-hidden="true"
      data-preflight-icon={state}
      className={cn(
        'block size-3.5',
        state === 'pending' && 'animate-spin',
        state === 'error' ? 'text-destructive' : 'text-muted-foreground'
      )}
    />
  )
}

/** Named checks stay field-sized; a failed row states its problem in the same line. */
export function PreflightRows({
  verdict,
  t,
  platform,
  problemText
}: {
  verdict: PreflightVerdict
  t: Translate
  platform: string
  problemText?: (problem: string) => string
}): JSX.Element | null {
  if (!verdict.rows.length) return null
  return (
    <ul
      className="m-0 grid list-none grid-cols-1 gap-x-3 gap-y-1 p-0 sm:grid-cols-2"
      data-import-preflight=""
    >
      {verdict.rows.map((row) => {
        const Icon =
          row.state === 'pending'
            ? Loader2
            : row.state === 'error'
              ? CircleX
              : row.state === 'warning'
                ? TriangleAlert
                : row.state === 'info'
                  ? Info
                  : CheckCircle2
        return (
          <li
            key={row.key}
            data-preflight-row={row.key}
            data-state={row.state}
            className={cn(
              'flex items-start gap-2 text-xs font-normal',
              row.problem && 'col-span-full order-last',
              row.state === 'error' ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn('mt-px size-3.5 shrink-0', row.state === 'pending' && 'animate-spin')}
            />
            <span>
              {row.problem && problemText
                ? problemText(row.problem)
                : t(`import_preflight_${row.key}`, {
                    platform: platform === 'wordpress' ? 'WordPress' : 'Joomla'
                  })}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Reveal each measured check as spinner then result; no check is invented by the animation. */
export function usePreflightAnimation(
  measured: PreflightVerdict,
  requestPending: boolean
): { verdict: PreflightVerdict; pending: boolean } {
  const [completed, setCompleted] = useState(0)
  const signature = JSON.stringify(measured.rows)
  useEffect(() => {
    setCompleted(0)
    if (requestPending || !measured.rows.length) return
    const timer = setInterval(
      () =>
        setCompleted((count) => {
          if (count + 1 >= measured.rows.length) clearInterval(timer)
          return Math.min(count + 1, measured.rows.length)
        }),
      180
    )
    return () => clearInterval(timer)
  }, [signature, requestPending])
  return preflightFrame(measured, completed, requestPending)
}

/** A pure projection of an already measured verdict, shared with the animation regression. */
export function preflightFrame(
  measured: PreflightVerdict,
  completed: number,
  requestPending: boolean
): { verdict: PreflightVerdict; pending: boolean } {
  if (requestPending)
    return {
      verdict: {
        rows: measured.rows.length
          ? [{ ...measured.rows[0], state: 'pending' as const, problem: undefined }]
          : [],
        blocked: true
      },
      pending: true
    }
  const pending = completed < measured.rows.length
  const rows = pending
    ? [
        ...measured.rows.slice(0, completed),
        { ...measured.rows[completed], state: 'pending' as const, problem: undefined }
      ]
    : measured.rows
  return {
    verdict: {
      ...measured,
      rows,
      problem: pending ? undefined : measured.problem,
      mine: pending ? false : measured.mine,
      blocked: pending || measured.blocked
    },
    pending
  }
}
