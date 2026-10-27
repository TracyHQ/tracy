// adopt_local_image, in both deploy scripts: a host that moved registry (GHCR -> ECR) still holds its
// earlier builds under the GHCR name only. A rollback or --no-pull that looks the image up by the new
// name must find it by tagging the GHCR copy, never by pulling.
//   node --test packages/fleet/tracy-fleet-operation/test/adopt-local-image.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultAssignments, shellFunction } from './stack-project-support.mjs'

const SCRIPTS = {
  'deploy-tracy-stack.sh': fileURLToPath(
    new URL('../../../../deploy/scripts/deploy-tracy-stack.sh', import.meta.url)
  ),
  'deploy-host-dsh.sh': fileURLToPath(new URL('../dsh/deploy-host-dsh.sh', import.meta.url))
}
const ECR = '123456789012.dkr.ecr.us-east-1.amazonaws.com/lab3-image/tracy-ai'

// A docker whose local store is the list FAKE_IMAGES (one ref per line); `tag` adds to it.
function fakeDocker() {
  const dir = mkdtempSync(path.join(tmpdir(), 'adopt-image-'))
  const bin = path.join(dir, 'docker')
  writeFileSync(
    bin,
    [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$FAKE_IMAGES.log"',
      'case "$1 $2" in',
      '  "image inspect") grep -qxF "$3" "$FAKE_IMAGES" ;;',
      '  tag*) printf "%s\\n" "$3" >> "$FAKE_IMAGES" ;;',
      '  *) echo "fake docker: unexpected $*" >&2; exit 9 ;;',
      'esac',
      ''
    ].join('\n')
  )
  chmodSync(bin, 0o755)
  return dir
}

function adopt(scriptFile, images, ref) {
  const dir = fakeDocker()
  const store = path.join(dir, 'images')
  writeFileSync(store, images.map((i) => `${i}\n`).join(''))
  writeFileSync(`${store}.log`, '')
  const code = [
    'set -euo pipefail',
    defaultAssignments(scriptFile, ['LEGACY_IMAGE_PREFIX']),
    'say() { printf \'%s\\n\' "$*"; }',
    shellFunction(scriptFile, 'adopt_local_image'),
    'adopt_local_image "$1"'
  ].join('\n')
  const r = spawnSync('bash', ['-c', code, 'adopt', ref], {
    encoding: 'utf8',
    env: { ...process.env, FAKE_IMAGES: store, PATH: `${dir}:${process.env.PATH}` }
  })
  return { ...r, images: readFileSync(store, 'utf8'), calls: readFileSync(`${store}.log`, 'utf8') }
}

for (const [name, file] of Object.entries(SCRIPTS)) {
  test(`${name}: an image only under its GHCR name is tagged under the ECR name, said in one line`, () => {
    const r = adopt(file, ['ghcr.io/tracyhq/tracy-dsh:ctx-aaa'], `${ECR}/tracy-dsh:ctx-aaa`)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /tagged it from ghcr\.io\/tracyhq\/tracy-dsh:ctx-aaa/)
    assert.ok(r.images.includes(`${ECR}/tracy-dsh:ctx-aaa\n`))
    assert.doesNotMatch(r.calls, /pull/, 'never pulls')
  })

  test(`${name}: an image already present is left alone; one present nowhere is reported missing`, () => {
    const here = adopt(file, [`${ECR}/tracy-web:app-1`], `${ECR}/tracy-web:app-1`)
    assert.equal(here.status, 0)
    assert.doesNotMatch(here.calls, /^tag /m)
    const gone = adopt(file, ['ghcr.io/tracyhq/tracy-web:app-0'], `${ECR}/tracy-web:app-1`)
    assert.notEqual(gone.status, 0)
    const ghcr = adopt(file, [], 'ghcr.io/tracyhq/tracy-web:app-1')
    assert.notEqual(ghcr.status, 0, 'a GHCR name has no older name to fall back to')
  })
}
