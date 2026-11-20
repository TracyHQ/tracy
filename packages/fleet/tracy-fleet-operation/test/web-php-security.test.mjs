import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const web = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8')
const PHP_IMAGES = ['joomla.Dockerfile', 'wordpress.Dockerfile', 'demos.Dockerfile']

test('the PHP security ini turns session.upload_progress off (CVE-2026-126714, CVE-2026-115560)', () => {
  assert.match(web('tracy-php-security.ini'), /^session\.upload_progress\.enabled\s*=\s*0\s*$/m)
})

for (const name of PHP_IMAGES) {
  test(`${name} ships the ini into conf.d and checks it took effect`, () => {
    const src = web(name)
    assert.match(
      src,
      /COPY --from=tracy-web-files --chmod=0644 tracy-php-security\.ini \/usr\/local\/etc\/php\/conf\.d\/zz-tracy-php-security\.ini/
    )
    assert.match(src, /ini_get\("session\.upload_progress\.enabled"\) === "0"/)
  })
}

// The floor RUN line is the same in every PHP image; run its PHP against version ids, no Docker needed.
const floorLine = /RUN php -r '([^']+)'/.exec(web('joomla.Dockerfile'))?.[1]

test('every PHP image carries the same patched-PHP floor', () => {
  assert.ok(floorLine, 'no floor RUN line in joomla.Dockerfile')
  for (const name of PHP_IMAGES) assert.ok(web(name).includes(floorLine), `${name} floor differs`)
})

const php = spawnSync('php', ['-v']).status === 0
test('the floor refuses unpatched bases and accepts the 19 Nov 2026 releases', {
  skip: !php && 'no php on PATH'
}, () => {
  const run = (id) => {
    // Replace PHP_VERSION_ID with a fixed id and force the ini check to pass, so only the floor decides.
    const code = floorLine
      .replace('$v = PHP_VERSION_ID;', `$v = ${id};`)
      .replace('ini_get("session.upload_progress.enabled") === "0"', 'true')
    return spawnSync('php', ['-r', code]).status
  }
  for (const id of [80235, 80336, 80427, 80512, 80129, 70433]) assert.equal(run(id), 1, `${id} accepted`)
  for (const id of [80236, 80337, 80428, 80513, 80600]) assert.equal(run(id), 0, `${id} refused`)
})

test('build.sh hashes the ini into every PHP image label, and not into EmDash', () => {
  const src = web('build.sh')
  assert.match(src, /^PHP_FILES="tracy-php-security\.ini"/m)
  assert.match(src, /\*\/joomla\.Dockerfile\|\*\/wordpress\.Dockerfile\) input_files="[^"]*\$PHP_FILES"/)
  assert.match(src, /\*\/demos\.Dockerfile\) input_files="[^"]*\$PHP_FILES"/)
  assert.ok(!/emdash\.Dockerfile\)[^;]*PHP_FILES/.test(src))
  const shared = /^WEB_FILES="([^"]*)"/m.exec(src)?.[1]
  assert.ok(shared && !shared.includes('tracy-php-security.ini'))
})

test('every IMAGE_TAGS line and the demo farm image moved to the patched 20261120-r1 tag', () => {
  const lines = web('IMAGE_TAGS')
    .split('\n')
    .filter((l) => /^[a-z][^#=]*=tracy\/web-/.test(l))
  assert.ok(lines.length >= 10)
  for (const l of lines) assert.match(l, /-20261120-r1$/, l)
  assert.match(web('DEMOS_IMAGE'), /^joomla:6-php8\.4-fpm=tracy\/web-demos:php8\.4-fpm-20261120-r1$/m)
})
