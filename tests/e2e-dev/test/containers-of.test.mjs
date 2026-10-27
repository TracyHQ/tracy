import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const LIB = fileURLToPath(new URL('../lib/', import.meta.url))

// A host with two sites whose labels share a prefix: `tamq` and `tamq-7q`. `ssh`, `sudo` and `docker`
// are stubs on PATH; the docker stub applies `--filter` as docker does (a name filter is a regexp,
// a label filter an exact value).
const DOCKER = `#!/usr/bin/env node
const rows = [
  { Names: 'tamq-web-1', State: 'exited', Status: 'Exited', Image: 'w', Labels: 'com.docker.compose.project=tamq' },
  { Names: 'tamq-db-1', State: 'running', Status: 'Up', Image: 'd', Labels: 'com.docker.compose.project=tamq' },
  { Names: 'tamq-7q-web-1', State: 'running', Status: 'Up', Image: 'w', Labels: 'com.docker.compose.project=tamq-7q' }
]
const args = process.argv.slice(2)
let out = rows
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--filter') continue
  const [kind, ...rest] = args[++i].split('=')
  const value = rest.join('=')
  out = out.filter((r) => kind === 'name' ? new RegExp(value).test(r.Names) : r.Labels.split(',').includes(value))
}
for (const r of out) console.log(JSON.stringify(r))
`

test("a site's containers are its compose project's, not every name that starts with its label", (t) => {
  const bin = mkdtempSync(join(tmpdir(), 'containers-of-'))
  t.after(() => rmSync(bin, { recursive: true, force: true }))
  const stub = (name, body) => {
    writeFileSync(join(bin, name), body)
    chmodSync(join(bin, name), 0o755)
  }
  stub('docker', DOCKER)
  stub('sudo', '#!/bin/sh\nexec "$@"\n')
  // ssh <options…> <target> <command>: run the command line here.
  stub('ssh', '#!/bin/sh\nfor last; do :; done\nexec sh -c "$last"\n')
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('E2E_DEV_') && k !== 'E2E_ENV')
  )
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const { containersOf } = await import(${JSON.stringify(new URL('sites.mjs', `file://${LIB}`).href)})
       console.log(JSON.stringify((await containersOf('tamq')).map((c) => c.name)))`
    ],
    {
      env: { ...clean, PATH: `${bin}:${process.env.PATH}`, E2E_DEV_SSH: 'stub@host.invalid' },
      encoding: 'utf8'
    }
  )
  assert.deepEqual(JSON.parse(out.trim().split('\n').at(-1)).sort(), ['tamq-db-1', 'tamq-web-1'])
})
