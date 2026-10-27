#!/usr/bin/env node
/**
 * The web images carry the site-mail shim, and web/build.sh cannot leave an image silently without
 * it.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/web-image-mail.test.mjs
 *
 * Web images are built ON THE HOST by web/build.sh, which used to ask one question: "does the tag
 * exist?". So an edit to a file an image copies, with the tag left alone, built nothing on any host
 * that already had that tag — and said "already built". build.sh now stamps each image with a hash
 * of its inputs (the Dockerfile plus the files it takes from web/) and:
 *   - skips an IMAGE_TAGS image whose stamp matches,
 *   - REFUSES one whose stamp differs (inputs changed, tag did not: a tag must mean one image),
 *   - rebuilds a tracy/web-emdash whose stamp is missing or differs (its tag is the EmDash version).
 * docker is a stub; nothing is built.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const WEB = fileURLToPath(new URL('../web/', import.meta.url))
const read = (f) => readFileSync(path.join(WEB, f), 'utf8')

const TEMP = []
after(() => {
  for (const d of TEMP) rmSync(d, { recursive: true, force: true })
})
/** A copy of web/ with its own IMAGE_TAGS, and a docker stub that logs builds. */
function webCopy(tags) {
  const dir = mkdtempSync(path.join(tmpdir(), 'web-build-'))
  TEMP.push(dir)
  for (const f of [
    'build.sh',
    'joomla.Dockerfile',
    'wordpress.Dockerfile',
    'emdash.Dockerfile',
    'tracy-sendmail',
    'tracy-sendmail.ini'
  ]) {
    copyFileSync(path.join(WEB, f), path.join(dir, f))
  }
  writeFileSync(path.join(dir, 'IMAGE_TAGS'), tags)
  const bin = path.join(dir, 'bin')
  spawnSync('mkdir', [bin])
  writeFileSync(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash
echo "$*" >> "$DOCKER_LOG"
case "$1 $2" in
  "image inspect")
    img="\${@: -1}"
    for pair in $DOCKER_IMAGES; do
      if [ "\${pair%%=*}" = "$img" ]; then
        case "$*" in *--format*) v="\${pair#*=}"; [ "$v" = - ] && echo "<no value>" || echo "$v" ;; esac
        exit 0
      fi
    done
    exit 1 ;;
  "images --format") for i in $DOCKER_EMDASH; do echo "$i"; done; exit 0 ;;
  "build -f") exit 0 ;;
esac
exit 0
`
  )
  chmodSync(path.join(bin, 'docker'), 0o755)
  return dir
}

function build(dir, only, { images = '', emdash = '' } = {}) {
  const log = path.join(dir, 'docker.log')
  writeFileSync(log, '')
  const r = spawnSync('bash', [path.join(dir, 'build.sh'), only], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE: '',
      PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
      DOCKER_LOG: log,
      DOCKER_IMAGES: images,
      DOCKER_EMDASH: emdash
    }
  })
  const builds = readFileSync(log, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('build '))
  return { ...r, builds }
}

const TAGS = `wordpress=tracy/web-wordpress:php8.3-apache-T
wordpress:php8.3-apache=tracy/web-wordpress:php8.3-apache-T
wordpress:php8.2-apache=tracy/web-wordpress:php8.2-apache-T
`

test('build.sh passes the named context and stamps the input hash; a matching stamp is skipped', () => {
  const dir = webCopy(TAGS)
  const first = build(dir, 'wordpress')
  assert.equal(first.status, 0, first.stderr)
  assert.equal(first.builds.length, 2, first.builds.join('\n'))
  for (const line of first.builds) {
    assert.ok(line.includes(`--build-context tracy-web-files=${dir}`), line)
    assert.match(line, /--label tracy\.web\.inputs=[0-9a-f]{64} /)
    // WordPress copies nothing from the main context: it stays this directory, not the repo.
    assert.ok(line.endsWith(` ${dir}`), line)
  }
  const hash = /tracy\.web\.inputs=([0-9a-f]{64})/.exec(first.builds[0])[1]

  const again = build(dir, 'wordpress', {
    images: `tracy/web-wordpress:php8.3-apache-T=${hash} tracy/web-wordpress:php8.2-apache-T=${hash}`
  })
  assert.equal(again.status, 0, again.stderr)
  assert.equal(again.builds.length, 0)
  assert.match(again.stdout, /php8\.3-apache-T already built/)
})

test('build.sh REFUSES an IMAGE_TAGS image built from other inputs, and accepts a pre-label one', () => {
  const dir = webCopy(TAGS)
  const r = build(dir, 'wordpress', {
    images: `tracy/web-wordpress:php8.3-apache-T=${'0'.repeat(64)} tracy/web-wordpress:php8.2-apache-T=-`
  })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /php8\.3-apache-T exists but was built from other inputs — add a new tag line/)
  assert.match(r.stdout, /php8\.2-apache-T already built \(before input labels\)/)
  assert.equal(r.builds.length, 0, 'a tag a site runs on is never rebuilt over')
})

test('build.sh changing the shim changes the stamp', () => {
  const dir = webCopy(TAGS)
  const a = /tracy\.web\.inputs=([0-9a-f]{64})/.exec(build(dir, 'wordpress').builds[0])[1]
  writeFileSync(path.join(dir, 'tracy-sendmail'), `${read('tracy-sendmail')}\n# changed\n`)
  const b = /tracy\.web\.inputs=([0-9a-f]{64})/.exec(build(dir, 'wordpress').builds[0])[1]
  assert.notEqual(a, b)
})

test('build.sh rebuilds a tracy/web-emdash with no stamp or another stamp, and skips a matching one', () => {
  const dir = webCopy(TAGS)
  const emdash = 'tracy/emdash:1.2.0'
  const unlabeled = build(dir, 'emdash', { images: 'tracy/web-emdash:1.2.0=-', emdash })
  assert.equal(unlabeled.status, 0, unlabeled.stderr)
  assert.equal(unlabeled.builds.length, 1)
  assert.match(unlabeled.builds[0], /-t tracy\/web-emdash:1\.2\.0 /)
  assert.match(unlabeled.stdout, /built from other inputs — rebuilding/)
  const hash = /tracy\.web\.inputs=([0-9a-f]{64})/.exec(unlabeled.builds[0])[1]

  const current = build(dir, 'emdash', { images: `tracy/web-emdash:1.2.0=${hash}`, emdash })
  assert.equal(current.builds.length, 0)
})

test('build.sh joomla needs the repo root as context, and says so when it is not there', () => {
  // A copy of web/ outside the repo has no vendor/ four levels up.
  const dir = webCopy('joomla:5-apache=tracy/web-joomla:5-apache-T\n')
  const r = build(dir, 'joomla')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /joomla needs a checkout of the repo/)
  assert.equal(r.builds.length, 0)
})
