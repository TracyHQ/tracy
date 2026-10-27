#!/usr/bin/env node
/**
 * Reading `findmnt` output — the one branch of attach-site.sh no host-less test can reach.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/mounts.test.mjs
 *
 * 🔒 WHY THIS IS TESTED AND THE REST OF attach-site.sh IS NOT. That script refuses to run without
 * root on Linux, so on any machine a test runs on, every line past the guard is unreachable. The
 * parsing below is therefore the only part that can be pinned — and it is where the bug was: the
 * first version stripped the leading `[` and left the trailing `]`, so the comparison could never
 * match on a host where /srv has a mount of its own, and attach-site unmounted and remounted a
 * perfectly good bind on every run. That is invisible in the output (it says `remounting`, once,
 * in a log nobody re-reads) and it drops the bind for an instant under any live agent session.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const LIB = fileURLToPath(new URL('../scripts/lib/mounts.sh', import.meta.url))

/** The parser, called the way attach-site.sh calls it. */
function parse(output) {
  return execFileSync('bash', ['-c', '. "$1"; bind_source_of_findmnt_output "$2"', '_', LIB, output], {
    encoding: 'utf8'
  }).replace(/\n$/, '')
}

test('a bind reads back as the subpath inside the brackets, both brackets gone', () => {
  assert.equal(parse('/dev/sda1[/tracy/acme/site]'), '/tracy/acme/site')
  assert.equal(parse('/dev/mapper/vg0-srv[/tracy/fijitrips/webroot]'), '/tracy/fijitrips/webroot')
  // The shape a single-root host prints, where the subpath IS the absolute path.
  assert.equal(parse('/dev/sda1[/srv/tracy/acme/site]'), '/srv/tracy/acme/site')
})

test('a whole filesystem has no subpath, and must not be read as one', () => {
  assert.equal(parse('/dev/sda1'), '')
  assert.equal(parse('tmpfs'), '')
  assert.equal(parse(''), '')
})

test('nothing the parser returns still carries a bracket', () => {
  for (const output of ['/dev/sda1[/a]', '/dev/sda1[/a/b]', '/dev/sda1', 'overlay']) {
    const parsed = parse(output)
    assert.ok(!parsed.includes('['), `${output} -> ${parsed}`)
    assert.ok(!parsed.includes(']'), `${output} -> ${parsed}`)
  }
})

test('the host path ends with the subpath — which is the whole point of stripping the bracket', () => {
  // /srv on its own filesystem: findmnt reports the subpath relative to THAT filesystem's root,
  // so an equality test against the absolute source can never match and the suffix test must.
  const sub = parse('/dev/sdb1[/tracy/acme/site]')
  const source = '/srv/tracy/acme/site'
  assert.ok(source.endsWith(sub), `${source} should end with ${sub}`)
  assert.notEqual(source, sub, 'if these were equal the bug would not have been reachable')
})
