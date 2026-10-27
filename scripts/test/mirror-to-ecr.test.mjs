// scripts/ci/mirror-to-ecr.sh with a fake docker whose "registries" are one file of refs: a missing
// ECR tag is copied from GHCR (the backfill of a reused context tag), a present one is not copied
// again, and the extra tags are pointed at it inside ECR.
//   node --test scripts/test/mirror-to-ecr.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { R, bash, tempDir, writeFiles } from './_shard.mjs'

const GHCR = 'ghcr.io/tracyhq/tracy-dsh'
const ECR = '123456789012.dkr.ecr.us-east-1.amazonaws.com/lab3-image/tracy-ai/tracy-dsh'

function mirror(refs, args) {
  const dir = tempDir('mirror-ecr-')
  const store = path.join(dir, 'refs')
  writeFiles(dir, {
    refs: refs.map((r) => `${r}\n`).join(''),
    'calls.log': '',
    'bin/docker': [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$FAKE_DIR/calls.log"',
      '[ "$1 $2" = "buildx imagetools" ] || { echo "fake docker: unexpected $*" >&2; exit 9; }',
      'shift 2',
      'case "$1" in',
      '  inspect) grep -qxF "$2" "$FAKE_DIR/refs" ;;',
      '  create)',
      '    shift; tags=()',
      '    while [ "$1" = --tag ]; do tags+=("$2"); shift 2; done',
      '    grep -qxF "$1" "$FAKE_DIR/refs" || { echo "no $1" >&2; exit 1; }',
      '    printf "%s\\n" "${tags[@]}" >> "$FAKE_DIR/refs" ;;',
      'esac',
      ''
    ].join('\n')
  })
  chmodSync(path.join(dir, 'bin/docker'), 0o755)
  const run = bash([path.join(R, 'scripts/ci/mirror-to-ecr.sh'), '--from', GHCR, '--to', ECR, ...args], {
    env: { FAKE_DIR: dir, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}` }
  })
  return {
    ...run,
    refs: readFileSync(store, 'utf8'),
    calls: readFileSync(path.join(dir, 'calls.log'), 'utf8')
  }
}

test('a context tag only GHCR holds (reused, not rebuilt) is copied to ECR, then the extra tags point at it', () => {
  const r = mirror(
    [`${GHCR}:ctx-aaa`],
    ['--source', 'ctx-aaa', '--tag', '2026-10-20-abcdef12', '--tag', 'latest']
  )
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.calls, new RegExp(`^buildx imagetools create --tag ${ECR}:ctx-aaa ${GHCR}:ctx-aaa$`, 'm'))
  for (const tag of ['ctx-aaa', '2026-10-20-abcdef12', 'latest'])
    assert.ok(r.refs.includes(`${ECR}:${tag}\n`), tag)
})

test('a context tag ECR already holds is not copied again', () => {
  const r = mirror([`${GHCR}:ctx-aaa`, `${ECR}:ctx-aaa`], ['--source', 'ctx-aaa'])
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /already in ECR - not copied again/)
  assert.doesNotMatch(r.calls, /create/)
})

test('a tag GHCR does not hold fails the job, and a bad tag is refused before any registry call', () => {
  assert.notEqual(mirror([], ['--source', 'ctx-missing']).status, 0)
  const bad = mirror([], ['--source', 'ctx-aaa', '--tag', 'a b'])
  assert.equal(bad.status, 2)
  assert.equal(bad.calls, '')
})
