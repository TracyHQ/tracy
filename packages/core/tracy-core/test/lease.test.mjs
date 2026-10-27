#!/usr/bin/env node
/**
 * The files `deploy-host-dsh.sh` reads to wait for running long work (issues #83, #295).
 *
 * The shell side only looks at names and mtimes, so what is pinned here is exactly that: a lease
 * exists while work runs and is gone after, and a stale `draining` file does not block imports.
 */
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { draining, holdLease } from '../src/lease/index.mjs'

function withHome(fn) {
  const home = mkdtempSync(path.join(tmpdir(), 'lease-'))
  const before = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    return fn(home)
  } finally {
    if (before === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = before
    rmSync(home, { recursive: true, force: true })
  }
}

test('a lease is on disk while the work runs, and gone once it is released', () =>
  withHome((home) => {
    const lease = holdLease('run1', { kind: 'import', siteKey: 'example.com' })
    assert.deepEqual(readdirSync(path.join(home, 'leases')), ['run1.json'])
    lease.release()
    lease.release()
    assert.equal(existsSync(path.join(home, 'leases', 'run1.json')), false)
  }))

test('draining: absent → no; fresh → yes; left behind by a deploy an hour ago → no', () =>
  withHome((home) => {
    assert.equal(draining(), false)
    const file = path.join(home, 'draining')
    writeFileSync(file, '')
    assert.equal(draining(), true)
    const old = (Date.now() - 61 * 60_000) / 1000
    utimesSync(file, old, old)
    assert.equal(draining(), false)
  }))

test('the file names the kind and the session, which is what the deploy log prints', () =>
  withHome((home) => {
    const lease = holdLease('build-x', { kind: 'build', siteKey: 'a.example', sessionId: 's1' })
    const body = JSON.parse(readFileSync(path.join(home, 'leases', 'build-x.json'), 'utf8'))
    assert.equal(body.id, 'build-x')
    assert.equal(body.kind, 'build')
    assert.equal(body.siteKey, 'a.example')
    assert.equal(body.sessionId, 's1')
    assert.match(body.heartbeatAt, /^\d{4}-\d\d-\d\dT/)
    lease.release()
  }))
