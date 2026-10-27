// Forms gate evidence for this template's footer newsletter band: an invalid email is blocked natively
// (0 POST), a valid submit posts exactly once even when the button is double-clicked, the band shows the
// form's own confirmation message, and the submission appears in the admin Submissions list (signed in
// with the storage state from admin-session.mjs). Notification mail is checked only when the form names
// recipients: this template ships none (no owner address is known — content-gaps G12), and inventing one
// would make the mail step pass for an address nobody reads.
//   node tools/forms-check.mjs <site> <admin-storage-state.json> <out.json> [--path /] [--mailpit http://127.0.0.1:8025]
import { readFileSync, writeFileSync } from 'node:fs'
import { launchBrowser } from './qa-browser.mjs'

const args = process.argv.slice(2)
const [site, storageState, out] = args
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
if (!site || !storageState || !out) {
  console.error(
    'usage: forms-check.mjs <site> <admin-storage-state.json> <out.json> [--path /] [--mailpit url]'
  )
  process.exit(2)
}
const pagePath = opt('--path', '/')
const mailpit = opt('--mailpit', 'http://127.0.0.1:8025')
const config = JSON.parse(readFileSync('template.config.json', 'utf8'))
const forms = JSON.parse(readFileSync(config.forms.file, 'utf8')).forms
const newsletter = forms.find((f) => f.slug === `newsletter-${config.defaultLocale}`)
if (!newsletter) {
  console.error(`no newsletter-${config.defaultLocale} form in ${config.forms.file}`)
  process.exit(2)
}
const confirmation = newsletter.settings.confirmationMessage
const result = { site, path: pagePath, capturedAt: new Date().toISOString(), steps: [], skipped: [] }
const step = (name, pass, detail) => {
  result.steps.push({ name, pass: !!pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${detail ? JSON.stringify(detail) : ''}`)
}

// The renderer the lockfile pins, like every other QA tool (tools/qa-browser.mjs).
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const posts = []
page.on('request', (r) => {
  if (r.method() === 'POST' && /emdash-forms\/submit/.test(r.url())) posts.push(r.url())
})
await page.goto(`${site}${pagePath}`, { waitUntil: 'networkidle' })
// The band is a React island in the footer; wait for hydration before interacting with it.
const form = page.locator('form.k-news-form').first()
await form.scrollIntoViewIfNeeded()
await page
  .waitForFunction(
    () =>
      document.querySelector('astro-island:not([ssr])') !== null ||
      !document.querySelector('astro-island[ssr]'),
    null,
    { timeout: 15000 }
  )
  .catch(() => {})
step(
  'newsletter form present with a form id',
  (await form.count()) === 1 && !!(await form.getAttribute('data-form-id')),
  {
    formId: await form.getAttribute('data-form-id')
  }
)

const input = form.locator('input[name=email]')
const submit = form.locator('button[type=submit]')
await input.fill('not-an-email')
await submit.click()
await page.waitForTimeout(800)
step('invalid email blocked natively (0 POST)', posts.length === 0, {
  posts: posts.length,
  invalid: await form.locator(':invalid').count()
})

const stamp = `qa-${Date.now()}`
await input.fill(`${stamp}@example.test`)
const firstResponse = page
  .waitForResponse((r) => /emdash-forms\/submit/.test(r.url()), { timeout: 10000 })
  .then(
    async (r) => ({ status: r.status(), body: (await r.text().catch(() => '')).slice(0, 300) }),
    (e) => ({ error: e.message })
  )
await submit.dblclick()
const response = await firstResponse
await page.waitForLoadState('networkidle')
await page.waitForTimeout(1000)
step('valid submit posts exactly once despite a double click', posts.length === 1, {
  posts: posts.length,
  response
})

const status = (
  await page
    .locator('.k-news-status')
    .first()
    .innerText()
    .catch(() => '')
).trim()
step("the form's confirmation message is shown", status === confirmation, { confirmation, shown: status })
step('email field cleared after success', (await input.inputValue()) === '')

const admin = await browser.newContext({ storageState })
const ap = await admin.newPage()
await ap.goto(`${site}/_emdash/admin/plugins/emdash-forms/submissions`, { waitUntil: 'networkidle' })
await ap
  .locator('main, table, [role=table]')
  .first()
  .waitFor({ timeout: 10000 })
  .catch(() => {})
await ap.waitForTimeout(2500)
// The page opens on the first form; pick ours by name (native select or a custom combobox).
const native = ap.locator('main select').first()
if (await native.count()) await native.selectOption({ label: newsletter.name }).catch(() => {})
else {
  const combo = ap.locator('main [role=combobox]').first()
  if (await combo.count()) {
    await combo.click()
    await ap.waitForTimeout(500)
    const option = ap.getByRole('option', { name: newsletter.name }).first()
    if (await option.count()) await option.click()
    else
      await ap
        .getByText(newsletter.name, { exact: true })
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

const recipients = newsletter.settings.notifyEmails ?? []
if (recipients.length === 0) {
  result.skipped.push({
    name: 'notification mail in Mailpit',
    reason: 'form has no notifyEmails (no owner address in the source)'
  })
  console.log('SKIP notification mail in Mailpit (form has no notifyEmails)')
} else {
  await new Promise((r) => setTimeout(r, 2000))
  const since = Date.parse(result.capturedAt) - 5000
  const inbox = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${recipients[0]}`)}`)
    .then((r) => r.json())
    .catch(() => null)
  const fresh = (inbox?.messages ?? []).filter((m) => Date.parse(m.Created) >= since)
  step('notification mail in Mailpit', fresh.length > 0, {
    to: recipients[0],
    fresh: fresh.map((m) => m.Subject)
  })
}

await admin.close()
await browser.close()
writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
process.exitCode = result.steps.every((s) => s.pass) ? 0 : 1
