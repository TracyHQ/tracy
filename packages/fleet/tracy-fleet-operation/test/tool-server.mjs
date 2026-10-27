#!/usr/bin/env node
/**
 * A long-lived host for the two node programs migrate-web-dns-alias.sh starts dozens of times per
 * run — the docker stub (fake-docker.mjs) and the real dns-alias.mjs. Starting a node process per
 * call cost ~40 ms each and ~55 calls per migration, i.e. most of the suite's wall time; here the
 * bash shims (built in migrate-web-dns-alias.test.mjs) send argv over a loopback socket and this process answers.
 *
 * Nothing is reimplemented: fake-docker.mjs `handle()` and the UNMODIFIED dns-alias.mjs both run
 * exactly as they do standalone. dns-alias.mjs is a script that reads process.argv and calls
 * process.exit, so each request re-imports it under a patched `process` (argv/exit/stdout/stderr)
 * and restores it afterwards; requests are served one at a time, so patches never overlap.
 *
 * Wire format, request: `<n>\n` then n NUL-terminated argv fields, then a NUL-terminated tool name,
 * FAKE_STATE, FAKE_LOG and caller pid. An argv field starting with \x01 is inline file CONTENT (the
 * shim cannot pass a `<(...)` descriptor over a socket); it is written to a temp file and replaced
 * by that path for the call. Reply: `<exit code>\n<stdout>\0<stderr>`, then EOF — no NUL occurs in
 * either stream, and the shim reads it with bash builtins only (no fork per call).
 *
 *   node tool-server.mjs <spool-dir> <dns-alias.mjs path>   # prints the port, then serves
 */
import { createServer } from 'node:net'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { handle as fakeDocker } from './fake-docker.mjs'

const [spool, dnsAliasPath] = process.argv.slice(2)
let seq = 0

class Exit extends Error {
  constructor(code) {
    super(`exit ${code}`)
    this.code = code
  }
}

async function runDnsAlias(args) {
  const real = {
    argv: process.argv,
    exit: process.exit,
    out: process.stdout.write,
    err: process.stderr.write
  }
  let stdout = ''
  let stderr = ''
  let code = 0
  process.argv = [process.execPath, dnsAliasPath, ...args]
  process.exit = (c) => {
    throw new Exit(c ?? 0)
  }
  process.stdout.write = (s) => ((stdout += s), true)
  process.stderr.write = (s) => ((stderr += s), true)
  try {
    // A fresh query string re-evaluates the module body, which is the whole program.
    await import(`${pathToFileURL(dnsAliasPath).href}?call=${++seq}`)
  } catch (e) {
    if (!(e instanceof Exit)) {
      stderr += String(e?.stack ?? e) + '\n'
      code = 1
    } else code = e.code
  } finally {
    process.argv = real.argv
    process.exit = real.exit
    process.stdout.write = real.out
    process.stderr.write = real.err
  }
  return { code, stdout, stderr }
}

let queue = Promise.resolve()

async function serve(fields) {
  const [tool, state, log, ppid, ...raw] = fields
  const temps = []
  const args = raw.map((a) => {
    if (a[0] !== '\x01') return a
    const f = path.join(spool, `in.${++seq}`)
    writeFileSync(f, a.slice(1))
    temps.push(f)
    return f
  })
  try {
    return await dispatch(tool, state, log, ppid, args)
  } finally {
    for (const f of temps) rmSync(f, { force: true })
  }
}

async function dispatch(tool, state, log, ppid, args) {
  if (tool === 'docker') {
    return fakeDocker({ args, env: { ...process.env, FAKE_STATE: state, FAKE_LOG: log }, ppid: Number(ppid) })
  }
  return runDnsAlias(args)
}

const server = createServer((sock) => {
  let buf = Buffer.alloc(0)
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    const nl = buf.indexOf(10)
    if (nl < 0) return
    const n = Number(buf.subarray(0, nl).toString())
    const fields = buf
      .subarray(nl + 1)
      .toString()
      .split('\0')
    // n argv fields + 4 header fields, then the empty tail after the last NUL.
    if (fields.length < n + 5) return
    sock.removeAllListeners('data')
    const req = fields.slice(0, n + 4)
    queue = queue.then(async () => {
      let r
      try {
        r = await serve(req)
      } catch (e) {
        r = { code: 70, stdout: '', stderr: `tool-server: ${e?.stack ?? e}\n` }
      }
      sock.end(`${r.code}\n${r.stdout}\0${r.stderr}`)
    })
  })
  sock.on('error', () => {})
})

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`${server.address().port}\n`)
})
