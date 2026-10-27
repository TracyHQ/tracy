// Forms gate evidence for this template's quote-request form: an invalid submit is blocked natively
// (0 POST), a valid submit posts exactly once even when the button is double-clicked, the page shows
// the form's own confirmation message, the submission appears in the admin Submissions list (signed
// in with the storage state from admin-session.mjs) and the notification mail lands in Mailpit.
//   node tools/forms-check.mjs <site> <admin-storage-state.json> <out.json> [--config template.config.json]
import { readFileSync, writeFileSync } from 'node:fs'
import { launchBrowser } from './qa-browser.mjs'
const [site, storageState, out] = process.argv.slice(2)
const config = JSON.parse(readFileSync('template.config.json', 'utf8'))
const forms = JSON.parse(readFileSync(config.forms.file, 'utf8')).forms
const quote = forms.find((f) => f.slug === `quote-request-${config.defaultLocale}`)
const confirmation = quote.settings.confirmationMessage
const result = { site, capturedAt: new Date().toISOString(), steps: [] }
const step = (name, pass, detail) => {
  result.steps.push({ name, pass: !!pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${detail ? JSON.stringify(detail) : ''}`)
}
// The renderer is chosen once, in qa-browser.mjs: Playwright's own Chromium by default (the build
// the lockfile pins), the machine's Chrome only when asked for by RENDER_CHROME_CHANNEL, and no
// silent fallback either way. This file used to prefer the installed Chrome — measured 2026-09-16,
// that is 152.0.7977.84 against the lockfile's 153.0.8010.12, and Chrome updates itself, so two
// runs a week apart could not be compared and nothing in the output said which had drawn them.
// This one had no fallback at all, so on a machine without Google Chrome it died at launch while
// the browser the lockfile already provides sat unused.
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const posts = []
page.on('request', (r) => {
  if (r.method() === 'POST' && /emdash-forms\/submit/.test(r.url())) posts.push(r.url())
})
const responses = []
page.on('response', async (r) => {
  if (r.request().method() === 'POST' && /emdash-forms\/submit/.test(r.url()))
    responses.push({ status: r.status(), body: (await r.text().catch(() => '')).slice(0, 300) })
})
await page.goto(`${site}/contact`, { waitUntil: 'networkidle' })
const form = page
  .locator('form')
  .filter({ has: page.locator('input[name=email]') })
  .first()
step('contact form present', (await form.count()) === 1)
await form.locator('button[type=submit]').first().click()
await page.waitForTimeout(800)
step('invalid submit blocked natively (0 POST)', posts.length === 0, {
  posts: posts.length,
  invalid: await form.locator(':invalid').count()
})
const stamp = `qa-${Date.now()}`
await form.locator('input[name=name]').fill(`QA ${stamp}`)
await form.locator('input[name=email]').fill(`${stamp}@example.test`)
if (await form.locator('input[name=company]').count())
  await form.locator('input[name=company]').fill('QA Ltd')
if (await form.locator('input[name=phone]').count())
  await form.locator('input[name=phone]').fill('+7 (999) 123-45-67')
// The design hides the native radio/checkbox behind a styled control; a DOM click on the input
// checks it and fires change exactly as the styled control does.
const radio = form.locator('input[type=radio]').first()
if (await radio.count()) await radio.evaluate((e) => e.click())
for (const cb of await form.locator('input[type=checkbox][required]').all())
  await cb.evaluate((e) => e.click())
const ta = form.locator('textarea').first()
if (await ta.count()) await ta.fill(`Message ${stamp}`)
const submit = form.locator('button[type=submit]').first()
const firstResponse = page
  .waitForResponse((r) => /emdash-forms\/submit/.test(r.url()), { timeout: 10000 })
  .then(
    async (r) => ({ status: r.status(), body: (await r.text().catch(() => '')).slice(0, 300) }),
    (e) => ({ error: e.message })
  )
await submit.dblclick()
responses.push(await firstResponse)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1000)
result.urlAfterSubmit = page.url()
step('valid submit posts exactly once despite a double click', posts.length === 1, {
  posts: posts.length,
  responses
})
const bodyText = await page.locator('body').innerText()
const at = bodyText.indexOf(confirmation.slice(0, 12))
step("the form's confirmation message is shown", bodyText.includes(confirmation), {
  confirmation,
  around: at >= 0 ? bodyText.slice(Math.max(0, at - 60), at + 120) : bodyText.slice(-200)
})
const admin = await browser.newContext({ storageState })
const ap = await admin.newPage()
await ap.goto(`${site}/_emdash/admin/plugins/emdash-forms/submissions`, { waitUntil: 'networkidle' })
// The list is client-rendered after the page's own network idle; give it a moment, then read main.
await ap
  .locator('main, table, [role=table]')
  .first()
  .waitFor({ timeout: 10000 })
  .catch(() => {})
await ap.waitForTimeout(2500)
// The page opens on the first form; pick ours by name (native select or a custom combobox).
const native = ap.locator('main select').first()
if (await native.count()) await native.selectOption({ label: quote.name }).catch(() => {})
else {
  const combo = ap.locator('main [role=combobox]').first()
  if (await combo.count()) {
    await combo.click()
    await ap.waitForTimeout(500)
    const option = ap.getByRole('option', { name: quote.name }).first()
    if (await option.count()) await option.click()
    else
      await ap
        .getByText(quote.name, { exact: true })
        .last()
        .click()
        .catch(() => {})
  }
}
await ap.waitForTimeout(2000)
const listText = await ap
  .locator('main')
  .innerText()
  .catch(() => ap.locator('body').innerText())
const listed = listText.includes(stamp)
step('submission listed in admin → Submissions', listed, {
  url: ap.url(),
  sample: listed ? undefined : listText.replace(/\s+/g, ' ').slice(0, 400)
})
await new Promise((r) => setTimeout(r, 2000))
const since = Date.parse(result.capturedAt) - 5000
const inbox = await fetch(
  'http://127.0.0.1:8025/api/v1/search?query=' + encodeURIComponent(`to:${quote.settings.notifyEmails[0]}`)
)
  .then((r) => r.json())
  .catch(() => null)
const fresh = (inbox?.messages ?? []).filter((m) => Date.parse(m.Created) >= since)
const smtp = await admin.newPage()
await smtp.goto(`${site}/_emdash/admin/plugins/emdash-smtp/logs`, { waitUntil: 'networkidle' })
await smtp.waitForTimeout(2500)
const smtpLog = (
  await smtp
    .locator('main')
    .innerText()
    .catch(() => '')
)
  .replace(/\s+/g, ' ')
  .slice(0, 500)
step('notification mail in Mailpit', fresh.length > 0, {
  to: quote.settings.notifyEmails[0],
  fresh: fresh.map((m) => m.Subject),
  inboxTotal: inbox?.messages_count ?? null,
  smtpLog
})
await admin.close()
await browser.close()
writeFileSync(out, JSON.stringify(result, null, 2) + '\n')
process.exitCode = result.steps.every((s) => s.pass) ? 0 : 1
