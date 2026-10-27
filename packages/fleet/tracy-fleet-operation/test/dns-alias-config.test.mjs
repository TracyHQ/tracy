// `dns-alias.mjs config-alias`: a resolved compose config carries exactly the one alias asked for.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/dns-alias.mjs', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'dns-alias-config-'))
after(() => rmSync(dir, { recursive: true, force: true }))

const ALIAS = 'tracy-web-0123abcd'
const CASES = [
  { name: 'the one alias asked for', networks: { tracy: { aliases: [ALIAS] } }, exit: 0 },
  { name: 'a second alias beside it', networks: { tracy: { aliases: [ALIAS, 'other-web'] } }, exit: 8 },
  { name: 'a different alias', networks: { tracy: { aliases: ['other-web'] } }, exit: 8 },
  { name: 'no alias on the tracy network', networks: { tracy: {} }, exit: 8 },
  { name: 'the shorthand list form, no aliases', networks: ['tracy'], exit: 8 },
  { name: 'not on the tracy network', networks: { other: { aliases: [ALIAS] } }, exit: 8 }
]

for (const c of CASES) {
  test(`config-alias: ${c.name} → exit ${String(c.exit)}`, () => {
    const config = join(dir, `${c.name.replace(/\W+/g, '-')}.json`)
    writeFileSync(config, JSON.stringify({ services: { web: { networks: c.networks } } }))

    const r = spawnSync(process.execPath, [
      SCRIPT,
      'config-alias',
      '--service',
      'web',
      '--alias',
      ALIAS,
      '--config',
      config
    ])

    assert.equal(r.status, c.exit, r.stderr.toString())
  })
}
