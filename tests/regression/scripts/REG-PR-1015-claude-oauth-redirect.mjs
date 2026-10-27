/**
 * REG-PR-1015-claude-oauth-redirect: Connect Claude asks Anthropic for the loopback redirect
 * http://localhost:53692/callback (the old console.anthropic.com code-paste address is refused with
 * "Invalid request format"), the plugin catches the callback itself, and the code exchange sends the
 * same redirect. In-process test first, then the running app over its DevTools port
 * (`TRACY_APP_CDP`, default http://127.0.0.1:9334); no app answering there = CANNOT RUN.
 * The authorize URL is read, never opened.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { cannotRun, checks, nodeTest, ROOT } from './lib.mjs'

const LOOPBACK = 'http://localhost:53692/callback'
const c = checks()

const unit = nodeTest(['test/claude-oauth-loopback.test.mjs'], {
  cwd: 'vendor/tracy/dsh-subscriptions',
  extra: ['--import', './test/_setup.mjs']
})
c.tapClean('S1', unit)
c.passes(
  'S1',
  unit,
  'Claude connect with default config: loopback redirect, auto catch, same redirect in the code exchange'
)

const cdp = process.env.TRACY_APP_CDP ?? 'http://127.0.0.1:9334'
try {
  const res = await fetch(`${cdp}/json/version`, { signal: AbortSignal.timeout(3000) })
  if (!res.ok) throw new Error(String(res.status))
} catch {
  cannotRun(`no Tracy Cowork app answers DevTools at ${cdp} (start it with --remote-debugging-port)`)
}
const require = createRequire(join(ROOT, 'tests/regression/playwright.config.mjs'))
const { chromium } = require('@playwright/test')
const browser = await chromium.connectOverCDP(cdp)
const page = browser
  .contexts()
  .flatMap((ctx) => ctx.pages())
  .find((p) => /^http:\/\/127\.0\.0\.1:\d+\//.test(p.url()))
if (page === undefined) cannotRun('the app window shows no dsh page')
const start = await page.evaluate(async () => {
  const r = await fetch('/dsh-subscriptions/oauth/start?provider=claude&index=1', { cache: 'no-store' })
  return { status: r.status, body: await r.json() }
})
c.eq('S2: oauth/start status', start.status, 200)
c.eq('S2: redirectUri', start.body?.redirectUri, LOOPBACK)
c.eq('S2: autoCatch', start.body?.autoCatch, true)
const url = new URL(String(start.body?.url ?? 'about:blank'))
c.eq('S2: authorize endpoint', url.origin + url.pathname, 'https://claude.ai/oauth/authorize')
c.eq('S2: redirect_uri in the URL', url.searchParams.get('redirect_uri'), LOOPBACK)
c.eq('S2: code', url.searchParams.get('code'), 'true')
c.eq('S2: client_id', url.searchParams.get('client_id'), '9d1c250a-e61b-44d9-88ed-5944d1962f5e')
c.eq('S2: code_challenge_method', url.searchParams.get('code_challenge_method'), 'S256')
let listening = ''
for (let i = 0; i < 20 && listening === ''; i++) {
  try {
    listening = execFileSync('lsof', ['-nP', '-iTCP:53692', '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8'
    }).trim()
  } catch {
    await new Promise((r) => setTimeout(r, 250))
  }
}
c.check('S2: TCP 53692 listens', listening !== '', listening)
c.done()
