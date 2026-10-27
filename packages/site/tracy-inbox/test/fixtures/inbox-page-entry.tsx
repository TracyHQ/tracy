/**
 * Fixture for `../e2e/inbox-fits-panel.test.mjs`: the real Inbox tab in a page, with the stylesheet
 * `apply()` injects (the build's Tailwind output plus `styles.ts`) over dsh's token sheet.
 *
 * Only `window.fetch` is mocked: seven unread notifications (three in Comments, four in Team
 * updates), the shape the owner saw on dev. `?theme=dark` sets dsh's dark signal on `<body>`, and
 * `?empty=1` answers an empty list.
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { TabLoadingScope } from '@tracy/ui'
import '../../../../../vendor/tracy/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css'
import { InboxTab } from '../../src/client/inbox'
import { en } from '../../src/client/strings'
import { CSS, TAILWIND } from '../../src/client/styles'

const query = new URLSearchParams(window.location.search)
if (query.get('theme') === 'dark') document.body.setAttribute('data-ds-dark-theme', '')

const style = document.createElement('style')
style.textContent = `${TAILWIND}\n${CSS}`
document.head.appendChild(style)

const NOW = Date.now()
const ago = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString()
const person = (id: string, name: string) => ({ id, email: `${id}@example.test`, name })
const LEE = person('lee', 'Lee Nguyen')
const MAI = person('mai', 'Mai Tran')
const SAM = person('sam', 'Sam Okafor')
let seq = 0
const row = (
  kind: string,
  actor: ReturnType<typeof person>,
  siteKey: string,
  data: Record<string, unknown>,
  minutes: number
) => ({
  id: `n${++seq}`,
  kind,
  siteKey,
  siteName: siteKey,
  actor,
  data,
  settledAt: null,
  createdAt: ago(minutes),
  readAt: null
})
const ROWS = query.get('empty')
  ? []
  : [
      row(
        'comment.mention',
        LEE,
        'northwind-bakery.tracy.site',
        { quote: '@akemi can you check the hero image on mobile?', commentId: 'c1', page: '/' },
        4
      ),
      row(
        'comment.reply',
        MAI,
        'riverside-clinic.tracy.site',
        { yours: true, quote: 'Done, the opening hours are updated.', commentId: 'c2', page: '/contact' },
        35
      ),
      row(
        'comment.resolved',
        SAM,
        'northwind-bakery.tracy.site',
        { quote: 'Footer links point to the old menu page', commentId: 'c3', page: '/menu' },
        180
      ),
      row('team.joined', MAI, 'riverside-clinic.tracy.site', { role: 'editor' }, 60),
      row('team.role_changed', LEE, 'harborlight-studio.tracy.site', { to: 'owner' }, 240),
      row('team.joined', SAM, 'northwind-bakery.tracy.site', { role: 'viewer' }, 600),
      row('team.left', LEE, 'meadowfarm-shop.tracy.site', {}, 1500)
    ]

const json = (body: unknown): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }))
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const pathname = new URL(url, window.location.origin).pathname
  if (pathname === '/api/notifications' && (init?.method ?? 'GET') === 'GET')
    return json({ notifications: ROWS, next: null, unread: ROWS.length })
  if (pathname === '/api/notifications/unread') return json({ unread: ROWS.length })
  if (pathname === '/api/notifications/read-all') return json({ ok: true })
  if (pathname === '/api/sites') return json({ sites: [] })
  if (pathname === '/auth/me') return json({ email: 'akemi@example.test', defaultSite: null })
  return Promise.resolve(new Response('not found', { status: 404 }))
}) as typeof fetch

// The English strings the tab ships with.
const t = (key: string, params?: Record<string, string | number>): string => {
  const raw = (en as Record<string, string>)[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
}

createRoot(document.getElementById('panel')!).render(
  createElement(TabLoadingScope, {
    label: t('loading.label'),
    children: createElement(InboxTab, { t: t as never, open: () => undefined })
  })
)
