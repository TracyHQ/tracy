#!/usr/bin/env node
// Keep a new EmDash site's forms from mailing anyone (25/10/2026: "Don't send email").
//
// A template's forms ship with the TEMPLATE's recipients: every one of the 80 forms of tracy-business 1.7.23
// (a quote and a newsletter form per language) notified `sales@northgate-ind.ru`, so once the site went live
// through the Tracy relay (configure-mail.mjs, #803), each message a visitor sent the business would have been
// mailed to the template's author. A Tracy site's forms store their submissions — the owner reads them in the
// admin — and mail nobody: this step empties each form's recipients, turns its digest off and drops its
// webhook (a template's webhook is the same leak by another road).
//
//   node quiet-forms.mjs --origin http://127.0.0.1:<port> --token-file <site>/tracy-agent.token
//
// Run by platform/emdash.sh ON THE HOST right after configure-mail.mjs, on the same terms: the site's own
// address, the PAT read from the protected file, never copied into /app. A site without the forms plugin has
// nothing to quiet. A form's autoresponder (a copy to the visitor) cannot be removed through the plugin's
// update route — it merges settings — so one is reported by count and left; tracy-business has none.
//
// What it does, and nothing else: lists the forms, updates each that would mail or call out, reads the list
// back and refuses (exit 1) unless every form is quiet. Words, fields and submissions are not touched.
// Exit: 0 quiet and read back (or no forms plugin) · 1 refused or failed · 2 bad arguments.
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_TIMEOUT_MS,
  MailConfigError,
  normalizeOrigin,
  parseArgs,
  readToken,
  request,
  validateToken
} from './configure-mail.mjs'

export const FORMS_PATH = '/_emdash/api/plugins/emdash-forms/forms'

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Whether a form would mail someone or call out when a visitor sends it. */
export function loud(form) {
  const s = isRecord(form?.settings) ? form.settings : {}
  return (
    (Array.isArray(s.notifyEmails) && s.notifyEmails.length > 0) ||
    (typeof s.webhookUrl === 'string' && s.webhookUrl !== '') ||
    s.digestEnabled === true
  )
}

async function listForms(ctx) {
  const data = await request(ctx, 'POST', `${FORMS_PATH}/list`, {})
  if (!Array.isArray(data.items) || !data.items.every((f) => isRecord(f) && typeof f.id === 'string'))
    throw new MailConfigError('BAD_RESPONSE', 'the forms list is not a list of forms')
  if (data.hasMore === true)
    throw new MailConfigError('TOO_MANY', 'the site holds more forms than one list answers')
  return data.items
}

/**
 * Quiet every form of the site at `origin`. Resolves to `{forms, quieted, autoresponders}`, or
 * `{plugin: 'absent'}` for a site without the forms plugin; rejects with a MailConfigError otherwise.
 */
export async function quietForms({
  origin,
  token,
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const ctx = { origin: normalizeOrigin(origin), token: validateToken(token), fetch: fetchImpl, timeoutMs }
  let forms
  try {
    forms = await listForms(ctx)
  } catch (err) {
    if (err instanceof MailConfigError && err.code === 'NOT_FOUND') return { plugin: 'absent' }
    throw err
  }
  const noisy = forms.filter(loud)
  for (const form of noisy)
    await request(ctx, 'POST', `${FORMS_PATH}/update`, {
      id: form.id,
      settings: { notifyEmails: [], webhookUrl: '', digestEnabled: false }
    })
  const now = noisy.length ? await listForms(ctx) : forms
  if (now.some(loud))
    throw new MailConfigError(
      'UNVERIFIED',
      'a form of the site still mails or calls out after it was quieted'
    )
  return {
    forms: forms.length,
    quieted: noisy.length,
    autoresponders: now.filter((f) => isRecord(f.settings) && isRecord(f.settings.autoresponder)).length
  }
}

async function main(argv) {
  let args
  try {
    args = parseArgs(argv)
    if (args.sender !== undefined) throw new MailConfigError('USAGE', 'unknown argument')
    normalizeOrigin(args.origin)
  } catch (err) {
    console.error(`quiet-forms: ${err.message}`)
    return 2
  }
  try {
    const r = await quietForms({ ...args, token: readToken(args.tokenFile) })
    console.log(
      r.plugin === 'absent'
        ? 'forms: no forms plugin'
        : `forms: ${r.forms} mail nobody (${r.quieted} quieted${r.autoresponders ? `, ${r.autoresponders} keep an autoresponder` : ''})`
    )
    return 0
  } catch (err) {
    console.error(`quiet-forms: ${err instanceof MailConfigError ? err.message : 'unexpected failure'}`)
    return 1
  }
}

const invoked = (() => {
  try {
    return (
      Boolean(process.argv[1]) &&
      realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    )
  } catch {
    return false
  }
})()
if (invoked) process.exitCode = await main(process.argv.slice(2))
