// Contact sheets for a person: the real HTML of every letter kind x en/vi (and the direct
// builders), a screenshot of each when a browser is available, a checklist to tick, and a receipt
// check that binds an acceptance to the exact HTML it was given. The machine never judges look or
// wording: without a valid receipt a sheet is PENDING.
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  REPO_ROOT,
  hashFile,
  loadProduct,
  readRegularBytes,
  readRegularFile,
  sha256,
  stable,
  writeAtomic
} from './common.mjs'
import { LINKS, decodeAttr, facts, rowFor } from './machine-support.mjs'
import { BUILDER_NAMES } from './machine.mjs'

export const SHEET_LANGS = ['en', 'vi']
export const CHECKLIST_ITEMS = ['layout', 'clipping', 'wording', 'tone', 'links-look-right']

const ACCEPT = `${facts.origin}/invite/${facts.direct.teamInvite.token}`

function builderLetter(mod, confirmation, name, lang) {
  const d = facts.direct
  switch (name) {
    case 'team.invited':
      return mod.teamInviteMail({ ...d.teamInvite, acceptUrl: ACCEPT, declineUrl: `${ACCEPT}/decline`, lang })
    case 'workspace-invite':
      return mod.inviteMail({ ...d.workspace, lang })
    case 'workspace-added':
      return mod.addedToWorkspace({ ...d.workspace, lang })
    case 'removal-code':
      return mod.removalCodeMail({ ...d.removal, lang })
    case 'signin-code':
      return mod.signInCodeMail('482916', lang)
    case 'whitelist-beta':
      return mod.betaMail({ ...d.beta, lang })
    case 'whitelist-confirmation':
      return confirmation.confirmationMail(
        d.confirmation.email,
        d.confirmation.data,
        d.confirmation.marketingOrigin,
        lang
      )
    default:
      throw new Error(`no sheet fixture for ${name}`)
  }
}

/** The letters a person should see: name -> html (the product's own output, untouched). */
export async function renderSheetLetters(root, { kinds, builders = BUILDER_NAMES, langs = SHEET_LANGS }) {
  const { letterFor } = await loadProduct(root, 'mail/letters/index.js')
  const emails = await loadProduct(root, 'mail/emails.js')
  const confirmation = await loadProduct(root, 'mail/confirmation-mail.js')
  const out = []
  for (const kind of kinds)
    for (const lang of langs) {
      const letter = letterFor({
        kind,
        lang,
        rows: [rowFor(kind)],
        recipient: { ...facts.recipient },
        links: LINKS
      })
      out.push({ name: kind, lang, subject: letter.subject, html: letter.html })
    }
  for (const b of builders)
    for (const lang of langs) {
      const letter = builderLetter(emails, confirmation, b, lang)
      out.push({ name: b, lang, subject: letter.subject, html: letter.html })
    }
  return out
}

async function openBrowser() {
  for (const name of ['playwright', 'playwright-core', '@playwright/test']) {
    let mod
    try {
      mod = await import(name)
    } catch {
      continue
    }
    const chromium = mod.chromium ?? mod.default?.chromium
    if (!chromium) continue
    try {
      return { browser: await chromium.launch({ headless: true }), via: name }
    } catch (error) {
      return { error: `chromium did not launch: ${String(error?.message ?? error).split('\n')[0]}` }
    }
  }
  return { error: 'no playwright package resolves from this workspace' }
}

/**
 * Write the sheets under `<outDir>/sheets`. Remote fonts and images are blocked so the capture is
 * deterministic and sends nothing out; a person is told so in the index.
 * @returns {Promise<{status: 'captured'|'html-only', reason: string, entries: object[], dir: string}>}
 */
export async function buildSheets({
  outDir,
  root = REPO_ROOT,
  kinds,
  builders = BUILDER_NAMES,
  langs = SHEET_LANGS,
  capture = true,
  revision = 'unknown'
}) {
  const dir = path.join(outDir, 'sheets')
  mkdirSync(dir, { recursive: true })
  const letters = await renderSheetLetters(root, { kinds, builders, langs })
  const entries = letters.map((l) => {
    const stem = `${l.name.replaceAll(/[^A-Za-z0-9.-]/g, '_')}.${l.lang}`
    writeAtomic(path.join(dir, `${stem}.html`), l.html)
    return {
      id: `${l.name}:${l.lang}`,
      name: l.name,
      lang: l.lang,
      subject: l.subject,
      html: `${stem}.html`,
      htmlSha256: sha256(l.html),
      image: null,
      imageSha256: null
    }
  })
  let status = 'html-only'
  let reason = 'screenshots not requested'
  if (capture) {
    const opened = await openBrowser()
    if (opened.error) reason = `screenshots unavailable (ENV): ${opened.error}`
    else {
      try {
        const context = await opened.browser.newContext({ viewport: { width: 720, height: 900 } })
        await context.route('**/*', (route) =>
          /^(file|data|about):/.test(route.request().url()) ? route.continue() : route.abort()
        )
        const queue = [...entries]
        await Promise.all(
          Array.from({ length: 4 }, async () => {
            while (queue.length > 0) {
              const e = queue.shift()
              const page = await context.newPage()
              try {
                await page.goto(`file://${path.join(dir, e.html)}`, { waitUntil: 'load' })
                const png = path.join(dir, e.html.replace(/\.html$/, '.png'))
                await page.screenshot({ path: png, fullPage: true })
                e.image = path.basename(png)
                e.imageSha256 = hashFile(png)
              } finally {
                await page.close()
              }
            }
          })
        )
        await context.close()
        status = 'captured'
        reason = `${entries.length} screenshots (remote fonts and images blocked)`
      } catch (error) {
        reason = `screenshots failed (ENV): ${String(error?.message ?? error).split('\n')[0]}`
      } finally {
        await opened.browser.close()
      }
    }
  }
  const checklist = {
    revision,
    note: 'Copy this file, fill `items` (true/false) and `accepted` (true/false), `by` and `at`, then run: node tests/qa/layers/mail/run.mjs --receipt <file>. The binding is `htmlSha256`: any change to the letter makes the receipt stale.',
    items: CHECKLIST_ITEMS,
    entries: entries.map((e) => ({
      ...e,
      ticks: Object.fromEntries(CHECKLIST_ITEMS.map((k) => [k, null])),
      accepted: null,
      by: null,
      at: null,
      note: null
    }))
  }
  writeAtomic(path.join(dir, 'checklist.json'), stable(checklist))
  const rows = entries
    .map(
      (e) =>
        `<figure><figcaption><code>${decodeAttr(e.id).replace(/</g, '&lt;')}</code><br>${e.subject.replace(/</g, '&lt;')}</figcaption>${e.image ? `<img src="${e.image}" width="360" alt="${e.id}">` : `<a href="${e.html}">open html</a>`}</figure>`
    )
    .join('\n')
  writeAtomic(
    path.join(dir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Mail contact sheet</title><style>body{font:14px sans-serif;margin:16px}figure{display:inline-block;vertical-align:top;margin:8px;max-width:370px}img{border:1px solid #ccc}</style><h1>Mail contact sheet</h1><p>${reason}. Look at layout, clipping, wording and tone, then tick checklist.json.</p>${rows}`
  )
  return { status, reason, entries, dir }
}

/**
 * Compare a person's receipt with the sheets just built. A captured image is re-read from `sheetDir`
 * (a regular file, no symlink) and re-hashed: a missing or changed image is never accepted.
 * @returns {Map<string, {state: 'accepted'|'rejected'|'pending'|'stale', reason: string}>} by entry id
 */
export function verifyReceipt(receiptFile, entries, revision = null, knownIds = null, sheetDir = null) {
  const out = new Map()
  const pending = (reason) => ({ state: 'pending', reason })
  const all = (state) => {
    for (const e of entries) out.set(e.id, state)
    return out
  }
  let receipt = null
  if (receiptFile) {
    try {
      const text = readRegularFile(receiptFile, 'receipt')
      if (text === null) return all(pending('receipt does not exist'))
      receipt = JSON.parse(text)
    } catch (error) {
      return all(pending(`receipt unreadable: ${error.message}`))
    }
    if (!receipt || typeof receipt !== 'object' || !Array.isArray(receipt.entries))
      return all(pending('receipt has no "entries" array'))
    if (typeof receipt.revision !== 'string' || receipt.revision === '')
      return all(pending('receipt names no revision'))
    if (revision && receipt.revision !== revision)
      return all({
        state: 'stale',
        reason: `receipt is for revision ${receipt.revision}, the tree is ${revision}`
      })
    for (const e of receipt.entries) {
      if (!e || typeof e !== 'object' || typeof e.id !== 'string' || e.id === '')
        return all(pending('receipt holds an entry without an id'))
      if (knownIds && !knownIds.has(e.id)) return all(pending(`receipt names an unknown sheet ${e.id}`))
    }
  }
  const count = new Map()
  for (const e of receipt?.entries ?? []) count.set(e.id, (count.get(e.id) ?? 0) + 1)
  const byId = new Map((receipt?.entries ?? []).map((e) => [e.id, e]))
  const validTicks = (r) =>
    r.ticks &&
    typeof r.ticks === 'object' &&
    !Array.isArray(r.ticks) &&
    Object.values(r.ticks).every((v) => typeof v === 'boolean') &&
    CHECKLIST_ITEMS.every((k) => typeof r.ticks[k] === 'boolean')
  const imageProblem = (e) => {
    if (!e.imageSha256) return null
    if (!sheetDir || typeof e.image !== 'string' || e.image !== path.basename(e.image))
      return 'the captured image cannot be located in the sheet directory'
    try {
      const bytes = readRegularBytes(path.join(sheetDir, e.image), 'captured image')
      if (bytes === null) return 'the captured image file is missing'
      return sha256(bytes) === e.imageSha256 ? null : 'the captured image file changed after it was captured'
    } catch (error) {
      return `the captured image is unreadable: ${error.message}`
    }
  }
  for (const e of entries) {
    const r = byId.get(e.id)
    const gone = r ? imageProblem(e) : null
    if (gone) out.set(e.id, pending(gone))
    else if (!r) out.set(e.id, pending(receipt ? 'not in the receipt' : 'no receipt given'))
    else if (count.get(e.id) > 1) out.set(e.id, pending('the receipt lists this letter more than once'))
    else if (typeof r.htmlSha256 !== 'string' || r.htmlSha256 !== e.htmlSha256)
      out.set(e.id, {
        state: 'stale',
        reason: 'the letter changed since it was looked at (htmlSha256 missing or differs)'
      })
    else if (!e.imageSha256)
      out.set(e.id, pending('no image was captured, so the visual obligation is still open'))
    else if (typeof r.imageSha256 !== 'string' || r.imageSha256 !== e.imageSha256)
      out.set(e.id, {
        state: 'stale',
        reason: 'the rendered image is missing from the receipt or differs from the one that was looked at'
      })
    else if (
      typeof r.by !== 'string' ||
      !r.by.trim() ||
      typeof r.at !== 'string' ||
      Number.isNaN(Date.parse(r.at))
    )
      out.set(e.id, pending('receipt names nobody or gives no valid time'))
    else if (typeof r.accepted !== 'boolean' || !validTicks(r))
      out.set(e.id, pending('receipt lacks a boolean "accepted" or a boolean tick for every checklist item'))
    else if (r.accepted === false || Object.values(r.ticks).some((v) => v === false))
      out.set(e.id, {
        state: 'rejected',
        reason: `rejected by ${r.by} at ${r.at}${r.note ? `: ${r.note}` : ''}`
      })
    else out.set(e.id, { state: 'accepted', reason: `accepted by ${r.by} at ${r.at}` })
  }
  return out
}

export const sheetsExist = (dir) => existsSync(path.join(dir, 'checklist.json'))
