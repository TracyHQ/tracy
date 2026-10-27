import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const library = fileURLToPath(new URL('../scripts/lib/web-image.sh', import.meta.url))
const tagsFile = fileURLToPath(new URL('../web/IMAGE_TAGS', import.meta.url))
function resolve(platform, base, overrides = {}) {
  return spawnSync('bash', ['-c', '. "$1"; tracy_web_image "$2" "$3"', '_', library, platform, base], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TRACY_WEB_IMAGE: '',
      TRACY_WEB_IMAGE_STRICT: '0',
      TRACY_WEB_IMAGE_CHECK: '0',
      TRACY_WEB_IMAGE_TAGS: tagsFile,
      ...overrides
    }
  })
}
function blocked(result) {
  assert.notEqual(result.status, 0, `must refuse, got ${result.stdout}`)
  assert.equal(result.stdout, '', 'no upstream fallback or silent PHP change')
  assert.match(result.stderr, /PHP 8\.1 is unsupported/)
}

test('PHP 8.1 is refused for new and existing sites on both PHP platforms', () => {
  for (const platform of ['wordpress', 'joomla']) {
    for (const strict of ['0', '1']) {
      blocked(resolve(platform, `${platform}:php8.1-apache`, { TRACY_WEB_IMAGE_STRICT: strict }))
      blocked(
        resolve(platform, `tracy/web-${platform}:php8.1-apache-20260923-r1`, {
          TRACY_WEB_IMAGE_STRICT: strict
        })
      )
    }
  }
})
test('an explicit image override cannot bypass the PHP 8.1 refusal or silently upgrade it', () => {
  blocked(
    resolve('wordpress', 'wordpress:php8.3-apache', {
      TRACY_WEB_IMAGE: 'tracy/web-wordpress:php8.1-apache-20260923-r1'
    })
  )
  blocked(
    resolve('wordpress', 'wordpress:php8.1-apache', {
      TRACY_WEB_IMAGE: 'tracy/web-wordpress:php8.3-apache-20261027-r1'
    })
  )
})
test('a stale mapping cannot resolve a supported request to a PHP 8.1 image', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'php-image-policy-'))
  try {
    const tags = path.join(dir, 'IMAGE_TAGS')
    writeFileSync(tags, 'wordpress:php8.3-apache=tracy/web-wordpress:php8.1-apache-20260923-r1\n')
    blocked(resolve('wordpress', 'wordpress:php8.3-apache', { TRACY_WEB_IMAGE_TAGS: tags }))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
test('supported PHP branches still resolve exactly and unsupported 8.1 is absent from the catalogue', () => {
  const tags = readFileSync(tagsFile, 'utf8')
  for (const platform of ['wordpress', 'joomla']) {
    for (const minor of ['8.2', '8.3', '8.4']) {
      if (platform === 'joomla' && minor === '8.2') continue
      const key = `${platform}:php${minor}-apache`
      const expected = tags
        .split('\n')
        .find((line) => line.startsWith(`${key}=`))
        .split('=')[1]
      const result = resolve(platform, key)
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stdout.trim(), expected)
    }
  }
  assert.doesNotMatch(tags, /^(wordpress|joomla):php8\.1-apache=/m)
})

test('a direct PHP image switch refuses 8.1 before writing compose, including --no-start', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'php-switch-policy-'))
  const script = fileURLToPath(new URL('../scripts/provision/set-web-image.sh', import.meta.url))
  try {
    const site = path.join(dir, 'policy')
    spawnSync('mkdir', ['-p', site])
    const compose = path.join(site, 'docker-compose.yml')
    const before = 'services:\n  web:\n    image: tracy/web-wordpress:php8.3-apache-20261027-r1\n'
    writeFileSync(compose, before)
    const result = spawnSync(
      'bash',
      [script, '--label', 'policy', '--root', dir, '--image', 'wordpress:php8.1-apache', '--no-start'],
      { encoding: 'utf8' }
    )
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /PHP 8\.1 is unsupported/)
    assert.equal(readFileSync(compose, 'utf8'), before)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Joomla aliases still on unpatched PHP 8.2.29 are refused without fallback', () => {
  for (const base of [
    'joomla:4-apache',
    'joomla:php8.2-apache',
    'tracy/web-joomla:4-apache-20260923-r1',
    'tracy/web-joomla:php8.2-apache-20260923-r1'
  ]) {
    for (const strict of ['0', '1']) {
      const result = resolve('joomla', base, { TRACY_WEB_IMAGE_STRICT: strict })
      assert.notEqual(result.status, 0, result.stdout)
      assert.equal(result.stdout, '')
      assert.match(result.stderr, /no patched upstream image/)
    }
  }
  assert.doesNotMatch(readFileSync(tagsFile, 'utf8'), /^joomla:(4|php8\.2)-apache=/m)
})
