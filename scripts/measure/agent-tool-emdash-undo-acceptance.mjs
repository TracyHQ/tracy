#!/usr/bin/env node
/** EmDash replacement and its native restore receipt, through the actual product AgentLoop. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { authenticatedToolRelay } from './lib/authenticated-tool-relay.mjs'
import { runPageSearchHarness } from '../../packages/tools/tracy-site-tools/test/fixtures/page-search-harness.mjs'
import { dockerExec } from '../../packages/tools/tracy-site-tools/src/host/exec.mjs'
const args = process.argv.slice(2),
  arg = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const fixture = JSON.parse(readFileSync(arg('--config', '')))
assert.equal(fixture.name, 'toolbench-crosscms-emdash')
assert.match(fixture.origin, /^http:\/\/127\.0\.0\.1:\d+$/)
const out = resolve(arg('--out', '/tmp/tracy-agent-reader-acceptance'))
mkdirSync(out, { recursive: true })
execFileSync('docker', [
  'exec',
  '-u',
  '0',
  fixture.name,
  'sh',
  '-c',
  'cp /app/data/tracy-agent.token /run/tracy-agent.token; chmod 600 /run/tracy-agent.token'
])
const native = () => {
  const code = `const D=require('better-sqlite3'),d=new D('data/data.db',{readonly:true});const tables=d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ec_%' ORDER BY name").all();console.log(require('node:crypto').createHash('sha256').update(JSON.stringify(tables.map(({name})=>[name,d.prepare('SELECT * FROM "'+name+'" ORDER BY id').all().map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['updated_at','version','live_revision_id','draft_revision_id'].includes(k))))]))).digest('hex'));`
  const raw = execFileSync('docker', ['exec', fixture.name, 'node', '-e', code], { encoding: 'utf8' })
  return createHash('sha256').update(raw).digest('hex')
}
const relay = await authenticatedToolRelay({ platform: 'emdash', fixture }),
  execs = [],
  observed = []
const exec = async (input) => {
  assert(input.argv.includes('owned-web-1'), 'Only the harness-owned site container may execute')
  execs.push({ stdin: input.stdin ?? null, command: input.argv.slice(0, 6) })
  return dockerExec({ ...input, argv: input.argv.map((a) => (a === 'owned-web-1' ? fixture.name : a)) })
}
const pluginConfig = { exec, emdash: { cms: async () => 'emdash' } }
const original = 'Building Russian industrial infrastructure since 2004',
  replacement = 'Building industrial infrastructure since 2004',
  path = '/about'
const before = native()
let undo = null
try {
  const respond = async (options, step) => {
    if (step > 1) {
      const last = options.messages.filter((m) => m.role === 'tool').at(-1)
      const text = last?.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      observed.push({ step: step - 1, hash: native(), answer: text })
      if (step === 2) {
        const a = JSON.parse(text)
        assert.equal(a.ok, true, JSON.stringify(a))
        undo = a.undo
        assert(undo, 'Replacement must return its real undo receipt')
      }
    }
    if (step === 1)
      return {
        calls: [
          {
            action: 'content.replace',
            params: {
              path,
              find: original,
              replace: replacement,
              ...(args.includes('--dry-run') ? { dryRun: true } : {})
            }
          }
        ]
      }
    if (step === 2 && !args.includes('--dry-run')) return { calls: [undo] }
    return { text: 'done' }
  }
  const run = await runPageSearchHarness([], {
    platform: 'emdash',
    transport: relay.transport,
    actorMint: relay.actorMint,
    pluginConfig,
    respond,
    userText: 'Replace this exact English heading, then use the returned Undo receipt to restore it.'
  })
  const after = native(),
    record = {
      platform: 'emdash',
      before,
      after,
      restored: before === after,
      actuallyChanged: observed.some((o) => o.hash !== before),
      undo,
      observed,
      execs,
      relayRequests: run.sent.map((s) => s.body)
    }
  writeFileSync(join(out, 'emdash-edit-undo.json'), JSON.stringify(record, null, 2) + '\n')
  assert(record.actuallyChanged, 'The CMS must actually change')
  assert.equal(after, before, 'Undo restores every measured content row')
  console.log(
    JSON.stringify({
      platform: 'emdash',
      restored: record.restored,
      actuallyChanged: record.actuallyChanged,
      execs: execs.length
    })
  )
} finally {
  await relay.close()
}
