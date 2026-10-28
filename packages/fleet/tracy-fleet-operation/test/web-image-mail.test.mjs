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
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const WEB = fileURLToPath(new URL('../web/', import.meta.url))
const read = (f) => readFileSync(path.join(WEB, f), 'utf8')

// Where joomla.Dockerfile expects the T4 skill in its build context (the source of its COPY line);
// the docker stub lists that path in the context each build is given.
const SKILL_REL = /^COPY (\S+) \/opt\/tracy\/joomlart-t4$/m.exec(read('joomla.Dockerfile'))?.[1]

const TEMP = []
after(() => {
  for (const d of TEMP) rmSync(d, { recursive: true, force: true })
})
/**
 * A copy of web/ with its own IMAGE_TAGS, and a docker stub that logs builds. `at`: the directory
 * to copy into (made if needed), to put web/ where a layout needs it; by default a fresh temp dir.
 */
function webCopy(tags, at = null) {
  const dir = at ?? mkdtempSync(path.join(tmpdir(), 'web-build-'))
  mkdirSync(dir, { recursive: true })
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
  "build -f")
    # What the build context holds at the T4 skill's path, said while the context still exists.
    ctx="\${@: -1}"
    echo "CTX $ctx :: $(ls "$ctx/$SKILL_REL" 2>&1 | tr '\n' ' ')" >> "$DOCKER_LOG"
    exit 0 ;;
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
      DOCKER_EMDASH: emdash,
      SKILL_REL
    }
  })
  const lines = readFileSync(log, 'utf8').split('\n')
  return {
    ...r,
    builds: lines.filter((l) => l.startsWith('build ')),
    contexts: lines.filter((l) => l.startsWith('CTX '))
  }
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

const JOOMLA_TAGS = `joomla:5-apache=tracy/web-joomla:5-apache-T
joomla:6-apache=tracy/web-joomla:6-apache-T
`
// What the stub's `ls` printed for the skill path of a context: both entries, in whatever order.
const holdsSkill = (ctxLine) => ctxLine.includes('README.md') && ctxLine.includes('assets')
const stampOf = (line) => /tracy\.web\.inputs=([0-9a-f]{64})/.exec(line)[1]

/** A fake T4 skill tree under `root`, with a file in a nested directory like the real assets/. */
function skillTree(root) {
  const skill = path.join(root, SKILL_REL)
  mkdirSync(path.join(skill, 'assets/t4'), { recursive: true })
  writeFileSync(path.join(skill, 'README.md'), 'skill\n')
  writeFileSync(path.join(skill, 'assets/t4/framework.zip'), 'zip\n')
  return skill
}

/** A layout root: a temp dir that is removed with the others. */
function layoutRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'web-layout-'))
  TEMP.push(root)
  return root
}

test('build.sh joomla from a checkout: the repo root is the context, as ever', () => {
  const root = layoutRoot()
  skillTree(root)
  const dir = webCopy(JOOMLA_TAGS, path.join(root, 'packages/fleet/tracy-fleet-operation/web'))
  const r = build(dir, 'joomla')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.builds.length, 2, r.builds.join('\n'))
  for (const line of r.builds) {
    assert.ok(line.endsWith(` ${root}`), line)
    assert.ok(line.includes(`--build-context tracy-web-files=${dir}`), line)
  }
  assert.ok(r.contexts.every(holdsSkill), r.contexts.join('\n'))
})

test('build.sh joomla on a host with no checkout: a temp copy of the skill tree is the context, made once and removed', () => {
  const root = layoutRoot()
  skillTree(root)
  // The layout of /opt/tracy-fleet: web/ with the skill tree under vendor/ beside it, nothing else around.
  const dir = webCopy(`${JOOMLA_TAGS}wordpress:apache=tracy/web-wordpress:apache-T\n`, path.join(root, 'web'))
  const r = build(dir, '')
  assert.equal(r.status, 0, r.stderr)
  const joomla = r.builds.filter((l) => l.includes('web-joomla'))
  const wordpress = r.builds.filter((l) => l.includes('web-wordpress'))
  assert.equal(joomla.length, 2, r.builds.join('\n'))
  assert.ok(wordpress[0].endsWith(` ${dir}`), 'WordPress keeps the web/ directory as its context')
  const contexts = joomla.map((l) => l.split(' ').at(-1))
  assert.equal(contexts[0], contexts[1], 'the tree is copied once per run, not once per image')
  assert.notEqual(contexts[0], dir)
  assert.ok(path.basename(contexts[0]).startsWith('web-build-ctx.'), contexts[0])
  const seen = r.contexts.filter((c) => c.startsWith(`CTX ${contexts[0]} `))
  assert.equal(seen.length, 2)
  assert.ok(seen.every(holdsSkill), 'the skill is at the path the COPY names')
  assert.ok(!existsSync(contexts[0]), 'the temporary context is removed when the run ends')
  assert.ok(existsSync(path.join(root, SKILL_REL, 'assets/t4/framework.zip')), 'the source tree is untouched')
  for (const line of joomla) assert.ok(line.includes(`--build-context tracy-web-files=${dir}`), line)
})

test('the same Joomla image gets the same stamp from a checkout and from a host', () => {
  const checkout = layoutRoot()
  skillTree(checkout)
  const host = layoutRoot()
  skillTree(host)
  const tags = 'joomla:5-apache=tracy/web-joomla:5-apache-T\n'
  const a = build(webCopy(tags, path.join(checkout, 'packages/fleet/tracy-fleet-operation/web')), 'joomla')
  const b = build(webCopy(tags, path.join(host, 'web')), 'joomla')
  assert.equal(a.status, 0, a.stderr)
  assert.equal(b.status, 0, b.stderr)
  // The stamp is the Dockerfile plus the shim files: it must not depend on where the skill tree came
  // from, or the same image would be REFUSED as "built from other inputs" on the other kind of host.
  assert.equal(stampOf(a.builds[0]), stampOf(b.builds[0]))
})

test('build.sh joomla with the skill tree in neither place names both paths and still builds WordPress', () => {
  // A copy of web/ in a bare temp dir has no vendor/ four levels up nor beside it.
  const dir = webCopy(`${JOOMLA_TAGS}wordpress:apache=tracy/web-wordpress:apache-T\n`)
  const r = build(dir, '')
  assert.notEqual(r.status, 0)
  assert.ok(r.stderr.includes('!! joomla needs the T4 skill tree and found it in neither place: '), r.stderr)
  assert.ok(r.stderr.includes(`/${SKILL_REL} (a checkout of the repo)`), r.stderr)
  assert.ok(
    r.stderr.includes(`${path.dirname(dir)}/${SKILL_REL} (a host that has the tracy-host image's files`),
    r.stderr
  )
  assert.match(r.stderr, /!! not built: tracy\/web-joomla:5-apache-T tracy\/web-joomla:6-apache-T/)
  assert.equal(r.builds.length, 1, 'only the WordPress image was built')
  assert.match(r.builds[0], /-t tracy\/web-wordpress:apache-T /)
})
