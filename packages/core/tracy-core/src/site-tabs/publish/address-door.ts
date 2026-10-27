/**
 * The address door of the Publish tab as state: the site's Tracy address form (Change address) and
 * the Owner's own domain (Connect domain, Check again, Remove, Reserve again). Moved out of the
 * Domains section (`SiteDomains`) unchanged when the tab became a stepped wizard (23/10/2026): the
 * same doors, asked the same way, with the same answers drawn.
 *
 *   GET    /api/sites/:key/address/availability?name=&kind=
 *   PUT    /api/sites/:key/address            { name, kind? }
 *   POST   /api/sites/:key/address/verify     { name }
 *   DELETE /api/sites/:key/address/domain     { name }
 */
import { useEffect, useRef, useState } from 'react'
import { addressErrorKey, addressRefusalCode } from '../../team/refusals'
import type { Translate } from '../../team/translate'
import type { PublishingControl } from '../SiteDomains'
import { type OwnDomain, ownDomainsOf, readOwnDomain, type Snapshot } from '../settings-rows'

export type AddressBusy = 'check' | 'save' | 'verify' | 'remove' | 'reserve' | null

/** Everything the address and domain steps draw, and the presses they can make. */
export interface AddressDoor {
  /** Which form is open: the site's Tracy address, or a domain of the Owner's own. */
  editing: 'address' | 'domain' | null
  name: string
  /** The name the door last said is free, and its kind. */
  checked: { name: string; kind: string } | null
  busy: AddressBusy
  /** A refusal said in the reader's words, or null. */
  error: string | null
  /** The site's own domains as the server last said them. */
  domains: OwnDomain[]
  type: (name: string) => void
  open: (form: 'address' | 'domain') => void
  close: () => void
  /** Ask the door: `check` and `save` for the open form, the rest about one domain. */
  act: (action: Exclude<AddressBusy, null>, about?: string) => void
}

export function useAddressDoor({
  siteKey,
  snapshot,
  control,
  refresh,
  t
}: {
  siteKey: string
  snapshot: Snapshot
  control: PublishingControl
  /** Read the tab's snapshot again from nothing (what the address form always asked for). */
  refresh: () => void
  t: Translate
}): AddressDoor {
  const request = useRef<AbortController | null>(null)
  const [editing, setEditing] = useState<'address' | 'domain' | null>(null)
  const [name, setName] = useState('')
  const [checked, setChecked] = useState<{ name: string; kind: string } | null>(null)
  const [busy, setBusy] = useState<AddressBusy>(null)
  const [error, setError] = useState<string | null>(null)
  // The site's own domains as the server last said them: the snapshot's, replaced by the answer of
  // a save or a check (which carries the domain as it stands after it), and read again whenever the
  // tab reads a new snapshot — the one place a domain's state ever comes from.
  const [domains, setDomains] = useState<OwnDomain[]>(() => ownDomainsOf(snapshot.addressChange))
  const from = useRef(snapshot.addressChange)
  useEffect(() => {
    if (from.current === snapshot.addressChange) return
    from.current = snapshot.addressChange
    setDomains(ownDomainsOf(snapshot.addressChange))
  }, [snapshot.addressChange])
  /** The domain a save or a check answered with, put in place of what was known of that name. */
  const learn = (raw: unknown): boolean => {
    const domain = readOwnDomain(raw)
    if (domain === null) return false
    setDomains((known) =>
      known.some((d) => d.name === domain.name)
        ? known.map((d) => (d.name === domain.name ? domain : d))
        : [...known, domain]
    )
    return true
  }
  useEffect(() => () => request.current?.abort(), [])
  // A bare domain is answered with the subdomain to enter instead, as the person typed the name.
  const explain = (code: string, typed?: string): string => {
    if (code !== 'DOMAIN_APEX_UNSUPPORTED') return t(addressErrorKey(code))
    const domain = (typed ?? '').trim().replace(/\.$/, '').toLowerCase()
    return t(addressErrorKey(code), { domain, suggestion: `www.${domain}` })
  }
  const act = async (action: Exclude<AddressBusy, null>, about?: string): Promise<void> => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(action)
    setError(null)
    const candidate = action === 'verify' || action === 'remove' || action === 'reserve' ? about : name.trim()
    // The domain form says which kind it is for, so a Tracy address typed into it is refused by
    // name instead of renaming the site; the address form asks as it always did.
    const kind = editing === 'domain' || action === 'reserve' ? 'custom' : null
    const saving = action === 'save' || action === 'reserve'
    try {
      const base = `/api/sites/${encodeURIComponent(siteKey)}/address`
      const url =
        action === 'check'
          ? `${base}/availability?name=${encodeURIComponent(candidate ?? '')}${kind ? `&kind=${kind}` : ''}`
          : action === 'verify'
            ? `${base}/verify`
            : action === 'remove'
              ? `${base}/domain`
              : base
      const response = await fetch(url, {
        method: action === 'check' ? 'GET' : saving ? 'PUT' : action === 'remove' ? 'DELETE' : 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        ...(action === 'check'
          ? {}
          : {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name: candidate, ...(saving && kind ? { kind } : {}) })
            })
      })
      // A refusal whose body is not JSON (a gateway's page, an empty 401) is still a refusal with
      // a status; reading it must not replace that status with a parse error (#796).
      const body = (await response.json().catch(() => null)) ?? {}
      if (controller.signal.aborted) return
      // The host's reason beats the generic code where it tells the person what to do (bug
      // 03/10/2026) — read only beside the code and status the door sends it with.
      if (!response.ok) throw new Error(addressRefusalCode(response.status, body.code, body.reason))
      if (action === 'check') {
        // "Taken" only when the door says so. A 200 that carries no verdict, or says "available"
        // without the name it judged, is an answer nobody can read: neither taken nor accepted.
        if (body.available !== true) {
          // The door says "taken" one way: `available: false`, with `NAME_TAKEN` beside it
          // (`sites/address.js`). Any other code on a 200 is not its answer.
          const taken = body.available === false && (body.code === undefined || body.code === 'NAME_TAKEN')
          throw new Error(taken ? 'NAME_TAKEN' : 'FAILED')
        }
        if (typeof body.name !== 'string' || body.name === '') throw new Error('FAILED')
        setChecked({ name: body.name, kind: body.kind })
        setName(body.name)
      } else if (action === 'remove') {
        // 200: it was only a reservation, and is gone. 202: the host is taking it out — the state
        // read back says "Removing…", and the domain leaves when the server says it has.
        if (body.ok === true && body.removed === candidate)
          setDomains((known) => known.filter((domain) => domain.name !== candidate))
        control.read()
      } else if (body.state === 'active' && typeof body.workspaceUrl === 'string') {
        const destination = new URL(body.workspaceUrl, window.location.origin)
        if (destination.origin !== window.location.origin) throw new Error('FAILED')
        destination.searchParams.set('tab', 'tracy:site-publish')
        // The address names the site by its new name, as everything else on the page now does.
        destination.searchParams.set(
          'site',
          typeof body.displayName === 'string' ? body.displayName : siteKey
        )
        window.location.assign(destination.href)
      } else if (
        (body.state === 'pending' && learn(body.pending)) ||
        (body.state === 'connected' && learn(body.connected))
      ) {
        setEditing(null)
        setChecked(null)
      } else {
        refresh()
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(explain(cause instanceof Error ? cause.message : 'FAILED', candidate))
        if (action === 'check' || action === 'save') setChecked(null)
      }
    } finally {
      if (!controller.signal.aborted) setBusy(null)
    }
  }
  return {
    editing,
    name,
    checked,
    busy,
    error,
    domains,
    type: (next) => {
      setName(next)
      setChecked(null)
      setError(null)
    },
    open: (form) => {
      setName(form === 'address' ? (snapshot.displayName ?? '') : '')
      setChecked(null)
      setError(null)
      setEditing(form)
    },
    close: () => {
      setEditing(null)
      setError(null)
    },
    act: (action, about) => void act(action, about)
  }
}
