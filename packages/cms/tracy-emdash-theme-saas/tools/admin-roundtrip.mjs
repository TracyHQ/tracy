#!/usr/bin/env node
// Editability evidence through the ADMIN UI (not the API): open an entry, change one text field,
// save, publish, prove the public page changed, then restore the original and prove it is back.
// Needs a signed-in storage state (admin-session.mjs). Writes a JSON report; exit 1 on any failure.
//   node tools/admin-roundtrip.mjs --site <origin> --storage-state <json> --entry <admin entry path>
//        --field <input/textarea id or name> --public <public path> --out <report.json>
import { writeFileSync } from 'node:fs'
import { launchBrowser } from './qa-browser.mjs'
import { newStamp, restoreVerified, stampCleanup, withoutStamp } from './roundtrip-cleanup.mjs'
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const site = opt('--site'),
  storageState = opt('--storage-state'),
  entry = opt('--entry'),
  field = opt('--field'),
  pub = opt('--public'),
  out = opt('--out')
if (!site || !storageState || !entry || !field || !pub || !out) {
  console.error(
    'usage: admin-roundtrip.mjs --site <origin> --storage-state <json> --entry <admin path> --field <id|name> --public <path> --out <report.json>'
  )
  process.exit(2)
}
const report = { site, entry, field, public: pub, capturedAt: new Date().toISOString(), steps: [] }
const step = (name, pass, detail) => {
  report.steps.push({ name, pass: !!pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`)
}
// The renderer is chosen once, in qa-browser.mjs: the Chromium Playwright itself ships by default,
// the machine's Chrome only when asked for by RENDER_CHROME_CHANNEL, and no silent fallback either
// way. This file used to prefer the installed Chrome -- measured 2026-09-17, that is 152.0.7977.84
// against Playwright's 153.0.8010.12, and Chrome updates itself, so two runs a week apart could
// not be compared and nothing in the output said which binary had drawn them. ⚠ This file does not
// record `browserIdentity()`; only visual-qa does. What it gains here is a renderer nobody has to
// guess at, not a trace in its own output.
const browser = await launchBrowser()
const admin = await browser.newContext({ storageState })
const visitor = await browser.newContext()
const ap = await admin.newPage(),
  vp = await visitor.newPage()
const control = () => ap.locator(`#${field}, [name="${field}"]`).first()
async function publicHas(text) {
  await vp.goto(`${site}${pub}`, { waitUntil: 'networkidle' })
  // Case-insensitive: a field rendered with text-transform: uppercase still carries the text.
  return (await vp.locator('body').innerText()).toLowerCase().includes(text.toLowerCase())
}
// EmDash editor: Save is disabled until a field changes and again once saved; a published
// entry with a saved draft offers "Publish changes" (and "Discard changes"). "Publication date"
// is a button too, so the publish match must be exact.
const saveButton = () => ap.locator('button[aria-label="Save"]:not([disabled])').first()
const publishButton = () => ap.getByRole('button', { name: /^publish changes$/i }).first()
async function saveAndPublish() {
  await saveButton().waitFor({ timeout: 10000 })
  await saveButton().click()
  // The saved draft is what makes "Publish changes" appear; wait for that, not for a button state.
  await publishButton().waitFor({ timeout: 15000 })
  await publishButton().click()
  // EmDash 1.1 uses a confirmation dialog; older releases offer a publish menu.
  const confirmation = ap.getByRole('dialog').getByRole('button', { name: /^publish changes$/i })
  const legacy = ap.getByRole('menuitem', { name: /^publish changes now$/i }).first()
  await confirmation.or(legacy).first().click()
  await publishButton()
    .waitFor({ state: 'detached', timeout: 15000 })
    .catch(() => {})
  await ap.waitForTimeout(1000)
  return { published: (await publishButton().count()) === 0 }
}
async function discardDraft() {
  const discard = ap.getByRole('button', { name: /^discard changes$/i }).first()
  if (!(await discard.count())) return false
  await discard.click()
  await ap.waitForTimeout(500)
  const confirm = ap
    .getByRole('dialog')
    .getByRole('button', { name: /discard/i })
    .first()
  if (await confirm.count()) await confirm.click()
  await discard.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
  await ap.waitForTimeout(800)
  return true
}
// What the finally block needs to undo a stamp left by a run that failed after its save.
const run = { stamp: null, stampSaved: false, restored: false }
async function removeStamp() {
  await ap.goto(`${site}${entry}`, { waitUntil: 'networkidle' })
  await control().waitFor({ timeout: 15000 })
  // Only this run's stamp comes out of what the field holds now (draft or published): no draft is
  // discarded and no value read earlier is written back, so an edit saved meanwhile is kept. A draft
  // without the stamp (a restore saved but not published) is published while the public page has it.
  const current = await control().inputValue()
  if (current.includes(run.stamp) || (await publicHas(run.stamp))) {
    await control().fill(withoutStamp(current, run.stamp))
    await saveAndPublish()
  }
  return {
    fieldHasStamp: (await control().inputValue()).includes(run.stamp),
    publicHasStamp: await publicHas(run.stamp)
  }
}
try {
  await ap.goto(`${site}${entry}`, { waitUntil: 'networkidle' })
  const welcome = ap
    .getByRole('dialog')
    .getByRole('button', { name: /get started|close/i })
    .first()
  if (await welcome.count()) await welcome.click()
  await control().waitFor({ timeout: 15000 })
  // Start from the published state: a leftover draft would poison "original".
  const discarded = await discardDraft()
  if (discarded) await ap.reload({ waitUntil: 'networkidle' })
  await control().waitFor({ timeout: 15000 })
  const original = await control().inputValue()
  const stamp = newStamp()
  run.stamp = stamp
  step('entry editor opened with the field', true, {
    original: original.slice(0, 60),
    discardedDraft: discarded
  })
  step('public page does not carry the stamp yet', !(await publicHas(stamp)))
  await control().fill(`${original} ${stamp}`)
  // Set before the save: a save that fails half way may still have stored the stamp as a draft.
  run.stampSaved = true
  const saved = await saveAndPublish()
  step('saved and published from the admin UI', true, saved)
  step('public page shows the edited text', await publicHas(stamp))
  await control().fill(withoutStamp(await control().inputValue(), stamp))
  const restored = await saveAndPublish()
  const fieldValue = await control().inputValue()
  const publicHasStamp = await publicHas(stamp)
  // Counted as restored only once proven; otherwise the finally block takes the stamp out.
  run.restored = restoreVerified({ ...restored, fieldValue, publicHasStamp, stamp })
  step('restored: published from the admin UI', restored.published, restored)
  step('restored: public page no longer shows the stamp', !publicHasStamp)
  step('restored: field holds the original value', fieldValue === original)
} catch (error) {
  step('round trip aborted', false, { error: error.message })
} finally {
  // Best effort: a run that stopped after its save must not leave the stamp on the site.
  if (stampCleanup(run) === 'remove') {
    try {
      const left = await removeStamp()
      step(
        'cleanup: stamp removed after the aborted round trip',
        !left.fieldHasStamp && !left.publicHasStamp,
        left
      )
    } catch (error) {
      step('cleanup: stamp removed after the aborted round trip', false, {
        error: error.message,
        stamp: run.stamp
      })
    }
  }
  await browser.close()
}
writeFileSync(out, JSON.stringify(report, null, 2) + '\n')
process.exitCode = report.steps.every((s) => s.pass) ? 0 : 1
