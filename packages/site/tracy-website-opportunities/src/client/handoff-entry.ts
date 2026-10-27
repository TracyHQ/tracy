/** Historical handoff URLs only read a receipt. The server exclusively owns sending the prompt. */
import type { Api } from './api.ts'

export interface HandoffEntryDeps {
  location: { pathname: string; search: string; hash?: string }
  api: Pick<Api, 'handOffState'>
  replaceUrl?: (url: string) => void
  onError?: (code: string) => void
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function receiveHandoff(deps: HandoffEntryDeps): (() => void) | void {
  const params = new URLSearchParams(deps.location.search)
  const buildId = params.get('wo-handoff')
  if (!buildId) return
  params.delete('wo-handoff')
  deps.replaceUrl?.(`${deps.location.pathname}${params.size ? `?${params}` : ''}${deps.location.hash ?? ''}`)
  if (!UUID.test(buildId)) return
  let cancelled = false
  void deps.api.handOffState(buildId).then((answer) => {
    if (cancelled) return
    const handoff = answer.ok ? (answer.body.handoff as { promptSent?: unknown } | undefined) : undefined
    if (!handoff?.promptSent) deps.onError?.('HANDOFF_NOT_READY')
  })
  return () => {
    cancelled = true
  }
}
