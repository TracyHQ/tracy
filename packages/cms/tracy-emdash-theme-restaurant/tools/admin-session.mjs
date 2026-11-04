#!/usr/bin/env node
// Sign in to the EmDash admin as an existing user through the "email link" flow, with the link
// read from a local Mailpit, and save the browser storage state. A built site has no dev bypass
// and passkeys need a real authenticator; the magic link is the one door a script can walk through
// without weakening the site. Configure SMTP → Mailpit first (configure-smtp.mjs).
//   node tools/admin-session.mjs --site <origin> --email <admin email> --out <storage-state.json>
//        [--mailpit http://127.0.0.1:8025] [--timeout 30000]
import { launchBrowser } from './qa-browser.mjs'
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const site = opt('--site'),
  email = opt('--email'),
  out = opt('--out')
const mailpit = opt('--mailpit', 'http://127.0.0.1:8025'),
  timeout = Number(opt('--timeout', '30000'))
if (!site || !email || !out) {
  console.error(
    'usage: admin-session.mjs --site <origin> --email <admin email> --out <storage-state.json> [--mailpit url]'
  )
  process.exit(2)
}
const since = Date.now()
// The renderer is chosen once, in qa-browser.mjs: the Chromium Playwright itself ships by default,
// the machine's Chrome only when asked for by RENDER_CHROME_CHANNEL, and no silent fallback either
// way. This file used to prefer the installed Chrome -- measured 2026-09-17, that is 152.0.7977.84
// against Playwright's 153.0.8010.12, and Chrome updates itself, so two runs a week apart could
// not be compared and nothing in the output said which binary had drawn them. ⚠ This file does not
// record `browserIdentity()`; only visual-qa does. What it gains here is a renderer nobody has to
// guess at, not a trace in its own output.
const browser = await launchBrowser()
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${site}/_emdash/admin/login`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /email link/i }).click()
  await page.locator('input[type=email]').fill(email)
  await page.getByRole('button', { name: /magic link/i }).click()
  // Poll Mailpit for a message to this address newer than the request.
  let link = null
  for (const started = Date.now(); Date.now() - started < timeout && !link; ) {
    await new Promise((r) => setTimeout(r, 1000))
    const list = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then(
      (r) => r.json()
    )
    for (const m of list.messages ?? []) {
      if (Date.parse(m.Created) < since - 5000) continue
      const body = await fetch(`${mailpit}/api/v1/message/${m.ID}`).then((r) => r.json())
      const text = `${body.Text ?? ''}\n${body.HTML ?? ''}`
      const found =
        text.match(new RegExp(`${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\s"'<>]*`, 'g')) ?? []
      link = found.find((u) => /token|magic|verify|login/i.test(u)) ?? found[0] ?? null
      if (link) break
    }
  }
  if (!link) throw new Error(`no sign-in link for ${email} in Mailpit within ${timeout}ms`)
  await page.goto(link.replace(/&amp;/g, '&'), { waitUntil: 'networkidle' })
  // EmDash 1.1 asks for confirmation before consuming an email sign-in link.
  if (new URL(page.url()).pathname === '/_emdash/admin/login/magic-link') {
    await page.getByRole('button', { name: /^continue$/i }).click()
  }
  await page.waitForURL((u) => u.pathname.startsWith('/_emdash/admin') && !u.pathname.includes('/login'), {
    timeout
  })
  // A first sign-in opens a welcome dialog whose backdrop swallows every later click; dismiss it
  // here so the saved state is a usable admin, not a modal.
  await page.waitForTimeout(1500)
  const welcome = page
    .getByRole('dialog')
    .getByRole('button', { name: /get started|close/i })
    .first()
  if (await welcome.count()) {
    await welcome.click()
    await page.waitForTimeout(800)
  }
  await context.storageState({ path: out })
  console.log(JSON.stringify({ status: 'signed-in', email, url: page.url(), storageState: out }))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
