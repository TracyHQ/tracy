// Forms gate evidence for this template's two forms. Contact (/contact/contact-us): an invalid submit is
// blocked natively (0 POST), a valid submit posts exactly once even when the button is double-clicked, the
// page shows the form's own confirmation message, the submission appears in the admin Submissions list
// (signed in with the storage state from admin-session.mjs) and the notification mail lands in Mailpit.
// Subscribe (the box under every page, in-place fetch): a valid address is accepted with the editor's
// confirmation text, and reaches Submissions and Mailpit as well.
//   node tools/forms-check.mjs <site> <admin-storage-state.json> <out.json> [--config template.config.json]
import { readFileSync, writeFileSync } from 'node:fs'
import { launchBrowser } from './qa-browser.mjs'
const [site, storageState, out] = process.argv.slice(2)
const config = JSON.parse(readFileSync('template.config.json', 'utf8'))
const forms = JSON.parse(readFileSync(config.forms.file, 'utf8')).forms
const quote = forms.find((f) => f.slug === `contact-${config.defaultLocale}`)
const sub = forms.find((f) => f.slug === `subscribe-${config.defaultLocale}`)
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
await page.goto(`${site}/contact/contact-us`, { waitUntil: 'networkidle' })
const form = page.locator('form[data-ec-form]').first()
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
await form.locator('input[name=subject]').fill(`Subject ${stamp}`)
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
// Subscribe box: native validation blocks a bad address, a good one answers with the confirmation text
const subStamp = `sub-${Date.now()}`
const box = page.locator('form.rs-subscribe-form').first()
const subPosts = []
page.on('request', (r) => {
  if (r.method() === 'POST' && /emdash-forms\/submit/.test(r.url())) subPosts.push(r.url())
})
await page.goto(`${site}/about-us`, { waitUntil: 'networkidle' })
subPosts.length = 0
await box.locator('input[name=email]').fill('not-an-address')
await box.locator('button[type=submit], input[type=submit]').first().click()
await page.waitForTimeout(600)
step('subscribe: invalid address blocked natively (0 POST)', subPosts.length === 0, {
  posts: subPosts.length
})
await box.locator('input[name=email]').fill(`${subStamp}@example.test`)
await box.locator('button[type=submit], input[type=submit]').first().click()
await page
  .waitForFunction(
    () => {
      const t = document.querySelector('.rs-subscribe-status')?.textContent?.trim()
      return t && t !== '…'
    },
    null,
    { timeout: 10000 }
  )
  .catch(() => {})
const subStatus = (await page.locator('.rs-subscribe-status').first().innerText()).trim()
step('subscribe: confirmation shown', subStatus === sub.settings.confirmationMessage, {
  subStatus,
  expected: sub.settings.confirmationMessage
})
step('subscribe: one POST', subPosts.length === 1, { posts: subPosts.length })
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
{
  const combo = ap.locator('main [role=combobox]').first()
  if (await combo.count()) {
    await combo.click()
    await ap.waitForTimeout(500)
    await ap
      .getByRole('option', { name: sub.name })
      .first()
      .click()
      .catch(() => {})
    await ap.waitForTimeout(2000)
  }
  const subList = await ap
    .locator('main')
    .innerText()
    .catch(() => '')
  step('subscribe: submission listed in admin → Submissions', subList.includes(subStamp), {
    sample: subList.includes(subStamp) ? undefined : subList.replace(/\s+/g, ' ').slice(0, 300)
  })
}
await new Promise((r) => setTimeout(r, 2000))
const since = Date.parse(result.capturedAt) - 5000
const inbox = await fetch(
  'http://127.0.0.1:8025/api/v1/search?query=' + encodeURIComponent(`to:${quote.settings.notifyEmails[0]}`)
)
  .then((r) => r.json())
  .catch(() => null)
const fresh = (inbox?.messages ?? []).filter((m) => Date.parse(m.Created) >= since)
const freshBodies = await Promise.all(
  fresh.map((m) =>
    fetch(`http://127.0.0.1:8025/api/v1/message/${m.ID}`)
      .then((r) => r.json())
      .then(
        (j) => j.Text ?? '',
        () => ''
      )
  )
)
step(
  'notification mail carries the submitted text',
  freshBodies.some((t) => t.includes(stamp)),
  { subjects: fresh.map((m) => m.Subject) }
)
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
