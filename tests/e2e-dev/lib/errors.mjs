// Which browser errors fail a journey (plan §2 D6). The verdict is decided by WHERE the error
// came from (frame and source URL) and WHAT the journey was checking at that moment:
//
//   - Tracy's own code (the workspace origin, `/plugins/@tracy/…`, `/__tracy/…`, the badge)
//     → FAIL, always.
//   - The customer site's own origin → FAIL only while the step under test is the site itself
//     (its home page, the preview iframe, a page the agent just changed); otherwise a note.
//   - dsh upstream (`/plugins/@deepseek-ai/…`) → a note: existing, not ours.
//   - Analytics, third-party hosts, a cache miss, a navigation that aborted a request → a note.

import { ENV } from './env.mjs'

const THIRD_PARTY_HOSTS = [
  /(^|\.)google-analytics\.com$/,
  /(^|\.)googletagmanager\.com$/,
  /(^|\.)doubleclick\.net$/,
  /(^|\.)facebook\.(net|com)$/,
  /(^|\.)hotjar\.com$/,
  /(^|\.)clarity\.ms$/,
  /(^|\.)gstatic\.com$/,
  /(^|\.)googleapis\.com$/,
  /(^|\.)cloudflareinsights\.com$/,
  /(^|\.)gravatar\.com$/,
  /(^|\.)youtube\.com$/,
  /(^|\.)vimeo\.com$/
]

const BENIGN_MESSAGES = [/ERR_CACHE_MISS/, /net::ERR_ABORTED/, /ResizeObserver loop/]

/**
 * @typedef {{ type: 'console' | 'pageerror' | 'requestfailed' | 'response' | 'websocket',
 *   url?: string, frameUrl?: string, message?: string, status?: number, stack?: string }} BrowserEvent
 * @typedef {{ siteStep?: boolean, siteLabels?: string[] }} StepContext
 * @typedef {{ verdict: 'fail' | 'note', owner: 'tracy' | 'site' | 'upstream' | 'third-party' | 'benign' | 'unknown', reason: string }} Classification
 */

function hostOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function pathOf(url) {
  try {
    // Path AND query: a dsh combo bundle names its plugins after `??`.
    const u = new URL(url)
    return `${u.pathname}${u.search}`
  } catch {
    return ''
  }
}

/**
 * Classify one browser event.
 * @param {BrowserEvent} event
 * @param {StepContext} [ctx]
 * @param {{ origin?: string, siteDomain?: string }} [env] - defaults to `ENV`; tests pass their own
 * @returns {Classification}
 */
export function classify(event, ctx = {}, env = ENV) {
  const message = event.message ?? ''
  if (BENIGN_MESSAGES.some((re) => re.test(message)))
    return { verdict: 'note', owner: 'benign', reason: 'benign browser message' }

  // The source is the resource URL when there is one, else the frame the error was raised in.
  const source = event.url || event.frameUrl || ''
  const host = hostOf(source)
  const path = pathOf(source)
  const workspaceHost = hostOf(env.origin ?? ENV.origin)
  const siteDomain = env.siteDomain ?? ENV.siteDomain

  if (THIRD_PARTY_HOSTS.some((re) => re.test(host)))
    return { verdict: 'note', owner: 'third-party', reason: `third-party host ${host}` }

  // Tracy's own pieces, wherever they are served from.
  if (path.startsWith('/__tracy/') || /\/tracy-badge\.js(\?|$)/.test(path))
    return { verdict: 'fail', owner: 'tracy', reason: `Tracy door ${path}` }

  if (host === workspaceHost) {
    // A combo bundle names several plugins in one URL; Tracy's name anywhere in it is enough to
    // own the error, the message prefix decides when it names only upstream ones.
    if (path.includes('@tracy/') || /\[tracy/i.test(message))
      return { verdict: 'fail', owner: 'tracy', reason: 'Tracy plugin' }
    if (path.includes('@deepseek-ai/') || message.startsWith('[dsh-'))
      return { verdict: 'note', owner: 'upstream', reason: 'dsh upstream plugin' }
    return { verdict: 'fail', owner: 'tracy', reason: `workspace origin ${path || '(page)'}` }
  }

  if (host && (host.endsWith(`.${siteDomain}`) || ctx.siteLabels?.some((l) => host.startsWith(`${l}.`)))) {
    if (ctx.siteStep)
      return { verdict: 'fail', owner: 'site', reason: `customer site ${host} during a site step` }
    return { verdict: 'note', owner: 'site', reason: `customer site ${host} outside a site step` }
  }

  if (host) return { verdict: 'note', owner: 'third-party', reason: `other host ${host}` }
  return { verdict: ctx.siteStep ? 'fail' : 'note', owner: 'unknown', reason: 'no source URL' }
}

/**
 * Split a list of events into the ones that fail the step and the ones kept as notes.
 * @param {BrowserEvent[]} events
 * @param {StepContext} [ctx]
 * @param {{ origin?: string, siteDomain?: string }} [env]
 */
export function triage(events, ctx = {}, env = ENV) {
  const fails = []
  const notes = []
  for (const event of events) {
    const c = classify(event, ctx, env)
    ;(c.verdict === 'fail' ? fails : notes).push({ ...event, ...c })
  }
  return { fails, notes }
}
