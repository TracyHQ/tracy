/**
 * `tracy-site-tools`, browser half: it draws nothing. Its one job is to tell the lane WHO is looking,
 * and from WHICH dsh session, so the host half's `tracy_site` tool acts as that person.
 *
 * Why the session id travels too (tasks/todo-site-tools.md P1.2): `tracy-site-tabs` remembers "the
 * viewer who pinged last", which is fine for a moment recorded once per turn but wrong for a tool —
 * two people in the same lane would have the agent act as whoever opened the page later. The tool
 * looks its viewer up by the agent's session id first, and only then falls back to the latest one.
 */
import { helloUntilGone } from '@tracy/core/hello'
import { dshUrl } from './dsh-url'
import { followShownSession, type SessionsLike } from './follow-session.mjs'
import { watchView } from './view-report.mjs'

/** The dsh session this page is on: `/s/<session-…>`, with or without the `/<siteKey>` prefix. */
function currentSessionId(): string | null {
  const m = /\/s\/(session-[a-z0-9-]+)/i.exec(location.pathname)
  return m ? m[1]! : null
}

/** The site this workspace is: `/<siteKey>/` in the page's base; null in the creation workspace. */
function pageSiteKey(): string | null {
  try {
    const m = /^\/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?:\/|$)/i.exec(new URL(document.baseURI).pathname)
    return m ? m[1]!.toLowerCase() : null
  } catch {
    return null
  }
}

/** The conversation the next hello binds. */
let helloFor: string | null = null
/** Stops for good once the server answers that the site behind this page is gone (#340). */
const greeter = helloUntilGone(() =>
  fetch(dshUrl('/api/tracy-site-tools/hello'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: helloFor })
  })
)

/** @param sessionId - the conversation to bind; the one in the address when not given. */
function hello(sessionId: string | null = currentSessionId()): void {
  helloFor = sessionId
  void greeter.hello()
}

export const inject = ['sessions']

export function apply(ctx: {
  effect: (fn: () => (() => void) | void, label?: string) => void
  sessions: SessionsLike
}): void {
  ctx.effect(() => {
    hello()
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') hello()
    }
    // Back and forward are navigations the address shows; a conversation opened inside the SPA is
    // not (`pushState` fires no `popstate`), so the sessions list is followed as well.
    const onNavigate = (): void => hello()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('popstate', onNavigate)
    const stopFollowing = followShownSession(ctx.sessions, (id) => hello(id))
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('popstate', onNavigate)
      stopFollowing()
    }
  }, 'tracy-site-tools: hello')
  // The page the customer has open beside the chat, said to the host so their message can be given a
  // picture of it (`view-report.mjs`, `view.mjs`). Draws nothing, and says nothing on a page with no
  // Browser tab.
  ctx.effect(
    () =>
      watchView({
        target: window,
        doc: document,
        sessionId: currentSessionId,
        siteKey: pageSiteKey,
        post: (report) => {
          void fetch(dshUrl('/api/tracy-site-tools/view'), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(report)
          }).catch(() => {})
        }
      }),
    'tracy-site-tools: open page'
  )
}
