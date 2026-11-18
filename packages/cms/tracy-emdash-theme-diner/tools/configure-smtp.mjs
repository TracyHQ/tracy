#!/usr/bin/env node
// Point the site's email at an SMTP server through the emdash-smtp plugin's own admin page API
// (the same form the admin UI posts), then send a test message. Local default: Mailpit on
// 127.0.0.1:1025 with no auth -- never a real mail server from this script.
//
//   node tools/configure-smtp.mjs --site <origin> [--token-file f] [--config template.config.json] [--host 127.0.0.1]
//        [--port 1025] [--security none|starttls|ssl] [--from addr] [--from-name Name] [--test to@example.com]
// From address/name default to `mail.fromEmail` / `mail.fromName` of the template config; nothing
// business-specific lives in this file.
import { existsSync, readFileSync } from 'node:fs'
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const CONFIG_FILE = opt('--config', 'template.config.json')
const config = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {}
const mail = config.mail ?? {}
// No implicit localhost site: a default port would quietly configure the wrong site.
const SITE = (opt('--site') ?? '').replace(/\/+$/, '')
if (!SITE) {
  console.error('configure-smtp.mjs: pass --site <origin> explicitly')
  process.exit(2)
}
const tokenFile = opt('--token-file', 'data/tracy-agent.token')
const token = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : ''
if (!token.startsWith('ec_pat_')) {
  console.error(`no agent token at ${tokenFile}`)
  process.exit(1)
}
const H = {
  authorization: `Bearer ${token}`,
  'X-EmDash-Request': '1',
  'content-type': 'application/json',
  accept: 'application/json'
}
async function admin(interaction) {
  const res = await fetch(`${SITE}/_emdash/api/plugins/emdash-smtp/admin`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(interaction)
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok)
    throw new Error(
      `${interaction.action_id ?? interaction.type} -> ${res.status} ${JSON.stringify(json).slice(0, 200)}`
    )
  const blocks = JSON.stringify(json)
  const m = blocks.match(/"message":"([^"]+)"/)
  return m ? m[1] : 'ok'
}
const values = {
  host: opt('--host', '127.0.0.1'),
  port: Number(opt('--port', '1025')),
  security: opt('--security', 'none'),
  username: opt('--username', ''),
  password: opt('--password', '')
}
console.log(
  'select_provider generic:',
  await admin({
    type: 'form_submit',
    action_id: 'select_provider',
    block_id: 'provider-picker',
    values: { providerId: 'generic' }
  })
)
console.log(
  'save_provider:',
  await admin({ type: 'form_submit', action_id: 'save_provider', block_id: 'provider-settings', values })
)
console.log(
  'save_global:',
  await admin({
    type: 'form_submit',
    action_id: 'save_global',
    block_id: 'global-settings',
    values: {
      primaryProviderId: 'generic',
      fallbackProviderId: '',
      fromEmail: opt('--from', mail.fromEmail ?? ''),
      fromName: opt('--from-name', mail.fromName ?? config.label ?? ''),
      replyTo: '',
      logLevel: 'all'
    }
  })
)
// Core picks ONE plugin for the exclusive email:deliver hook; say which.
const ex = await fetch(`${SITE}/_emdash/api/admin/hooks/exclusive/email:deliver`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({ pluginId: 'emdash-smtp' })
})
console.log('exclusive email:deliver ->', ex.status, (await ex.text()).slice(0, 120))
const to = opt('--test', '')
if (!opt('--from', mail.fromEmail ?? '')) {
  console.error('no from address: set mail.fromEmail in the template config or pass --from')
  process.exit(2)
}
if (to)
  console.log(
    'send_test:',
    await admin({
      type: 'form_submit',
      action_id: 'send_test',
      block_id: 'test-send',
      values: {
        to,
        subject: `${config.label ?? config.site?.title ?? 'Site'} SMTP test`,
        text: 'Test from tools/configure-smtp.mjs'
      }
    })
  )
