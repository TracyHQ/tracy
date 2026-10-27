// `POST /_host/site-files` (site-files.js): the language files and template sources of one site,
// read-only, for tracy-web's `content.locate`. The set is fixed by platform, links are never
// followed, and a caller holding the current fingerprint receives no bytes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildApp } from '../src/app.js'
import { readSiteFiles, SITE_FILE_LIMITS } from '../src/site-files.js'
import { signHostCall } from '../../tracy-web/src/host/client.js'

async function tree(files) {
  const root = await mkdtemp(path.join(tmpdir(), 'site-files-'))
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true })
    await writeFile(path.join(root, rel), text)
  }
  return root
}

const JOOMLA = {
  'lantern/.webroot/configuration.php': '<?php class JConfig {}',
  'lantern/.webroot/language/en-GB/mod_languages.ini': 'MOD_LANGUAGES_DESC="Select your language"\n',
  'lantern/.webroot/language/en-GB/mod_languages.sys.ini': 'MOD_LANGUAGES="Language Switcher"\n',
  'lantern/.webroot/language/ru-RU/mod_languages.ini': 'MOD_LANGUAGES_DESC="Выберите язык"\n',
  'lantern/.webroot/language/overrides/en-GB.override.ini': 'COM_USERS_PROFILE_DEFAULT_LABEL="My account"\n',
  'lantern/.webroot/templates/tb/html/layouts/header.html': '<button aria-label="Open menu"></button>',
  'lantern/.webroot/templates/tb/language/en-GB/en-GB.tpl_tb.ini': 'TPL_TB_DARK="Dark"\n',
  'lantern/.webroot/templates/tb/acm/hero/en-GB.hero.ini': 'TPL_TB_HERO="Hero"\n',
  'lantern/.webroot/templates/tb/acm/hero/ru-RU.hero.ini': 'TPL_TB_HERO="Герой"\n',
  'lantern/.webroot/templates/tb/vendor/lib.php': '<?php echo "not ours";',
  'lantern/.webroot/templates/tb/css/site.css': 'body{}'
}

test('Joomla: the page language’s strings, the override file and template layouts — nothing else', async () => {
  const root = await tree(JOOMLA)
  try {
    await symlink('/etc', path.join(root, 'lantern/.webroot/templates/tb/html/escape'))
    await symlink('/etc/hosts', path.join(root, 'lantern/.webroot/templates/tb/html/hosts.php'))
    const read = await readSiteFiles({ label: 'lantern', locale: 'en-GB', config: { sitesRoot: root } })
    assert.equal(read.status, 200)
    assert.equal(read.body.platform, 'joomla')
    assert.deepEqual(read.body.files.map((one) => one.path).sort(), [
      'language/en-GB/mod_languages.ini',
      'language/overrides/en-GB.override.ini',
      'templates/tb/acm/hero/en-GB.hero.ini',
      'templates/tb/html/layouts/header.html',
      'templates/tb/language/en-GB/en-GB.tpl_tb.ini'
    ])
    assert.equal(
      read.body.files.find((one) => one.path.endsWith('header.html')).text,
      JOOMLA['lantern/.webroot/templates/tb/html/layouts/header.html']
    )
    assert.match(read.body.fingerprint, /^[a-f0-9]{64}$/)
    assert.equal(read.body.truncated, undefined)

    // Asked again with the fingerprint it holds: no bytes.
    const again = await readSiteFiles({
      label: 'lantern',
      locale: 'en-GB',
      known: read.body.fingerprint,
      config: { sitesRoot: root }
    })
    assert.deepEqual(again.body, { platform: 'joomla', fingerprint: read.body.fingerprint, unchanged: true })

    // A file that moved changes the fingerprint.
    await writeFile(
      path.join(root, 'lantern/.webroot/language/overrides/en-GB.override.ini'),
      'X="Y and a longer value"\n'
    )
    const moved = await readSiteFiles({
      label: 'lantern',
      locale: 'en-GB',
      known: read.body.fingerprint,
      config: { sitesRoot: root }
    })
    assert.notEqual(moved.body.fingerprint, read.body.fingerprint)
    assert.equal(moved.body.unchanged, undefined)

    // Another language reads that language's files only.
    const ru = await readSiteFiles({ label: 'lantern', locale: 'ru-RU', config: { sitesRoot: root } })
    assert.ok(ru.body.files.some((one) => one.path === 'language/ru-RU/mod_languages.ini'))
    assert.ok(ru.body.files.every((one) => !one.path.includes('en-GB')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('WordPress: themes, plugins, core block renderers and picture names; .po only for a translated locale', async () => {
  const root = await tree({
    'wp/.webroot/wp-includes/version.php': '<?php $wp_version = "7.0";',
    'wp/.webroot/wp-includes/blocks/navigation.php': "<?php __( 'Open menu' );",
    'wp/.webroot/wp-includes/functions.php': "<?php __( 'Not a block' );",
    'wp/.webroot/wp-content/themes/biz/parts/header.html':
      '<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph -->',
    'wp/.webroot/wp-content/themes/biz/assets/logo.png': 'png',
    'wp/.webroot/wp-content/themes/biz/assets/app.js': 'x()',
    'wp/.webroot/wp-content/plugins/polylang/include/switcher.php': "<?php __( 'Language', 'polylang' );",
    'wp/.webroot/wp-content/plugins/polylang/flags/us.png': 'png',
    'wp/.webroot/wp-content/plugins/polylang/vendor/autoload.php': '<?php',
    'wp/.webroot/wp-content/languages/ru_RU.po': 'msgid "Open menu"\nmsgstr "Открыть меню"\n',
    'wp/.webroot/wp-content/languages/themes/biz-ru_RU.po': 'msgid "x"\nmsgstr "y"\n'
  })
  try {
    const en = await readSiteFiles({ label: 'wp', locale: 'en-US', config: { sitesRoot: root } })
    assert.equal(en.body.platform, 'wordpress')
    assert.deepEqual(en.body.files.map((one) => one.path).sort(), [
      'wp-content/plugins/polylang/include/switcher.php',
      'wp-content/themes/biz/parts/header.html',
      'wp-includes/blocks/navigation.php'
    ])
    assert.deepEqual(en.body.images.sort(), [
      'wp-content/plugins/polylang/flags/us.png',
      'wp-content/themes/biz/assets/logo.png'
    ])
    const ru = await readSiteFiles({ label: 'wp', locale: 'ru-RU', config: { sitesRoot: root } })
    assert.ok(ru.body.files.some((one) => one.path === 'wp-content/languages/ru_RU.po'))
    assert.ok(ru.body.files.some((one) => one.path === 'wp-content/languages/themes/biz-ru_RU.po'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('caps: an oversized file is skipped, a set past the total says truncated; no webroot is 404', async () => {
  const root = await tree({
    ...JOOMLA,
    'lantern/.webroot/templates/tb/html/huge.php': 'x'.repeat(SITE_FILE_LIMITS.fileBytes + 1)
  })
  try {
    const read = await readSiteFiles({ label: 'lantern', locale: 'en-GB', config: { sitesRoot: root } })
    assert.ok(read.body.files.every((one) => !one.path.endsWith('huge.php')))
    const cut = await readSiteFiles({
      label: 'lantern',
      locale: 'en-GB',
      config: { sitesRoot: root },
      limits: { totalBytes: 60 }
    })
    assert.equal(cut.body.truncated, true)
    assert.ok(cut.body.files.length < read.body.files.length)
    const none = await readSiteFiles({ label: 'nobody', locale: 'en-GB', config: { sitesRoot: root } })
    assert.deepEqual(none, { status: 404, body: { code: 'NO_WEBROOT' } })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('POST /_host/site-files: signed, label fenced, answers the read', async () => {
  const root = await tree(JOOMLA)
  try {
    const app = buildApp({
      config: { hostName: 'local', hostSecret: 'h', sitesRoot: root },
      run: async () => ({ code: 0, tail: [] })
    })
    const post = async (payload) => {
      const body = JSON.stringify(payload)
      const headers = await signHostCall({ secret: 'h', path: '/_host/site-files', body })
      return app.fetch(
        new Request('http://tracy-host.test/_host/site-files', {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body
        })
      )
    }
    const ok = await post({ label: 'lantern', locale: 'en-GB' })
    assert.equal(ok.status, 200)
    assert.equal((await ok.json()).platform, 'joomla')
    const escape = await post({ label: '../lantern', locale: 'en-GB' })
    assert.equal(escape.status, 400)
    const unsigned = await app.fetch(
      new Request('http://tracy-host.test/_host/site-files', { method: 'POST', body: '{}' })
    )
    assert.equal(unsigned.status, 403)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ── EmDash: the template source lives in the site's container, not in a webroot ─────────────────

/** Files of `/app/src` in a fake container: path relative to `/app/src` → [text, mtime seconds]. */
const EMDASH_SRC = {
  'components/site/Breadcrumb.astro': [
    '<nav class="breadcrumb" aria-label="Breadcrumb"></nav>\n',
    1790291438
  ],
  'components/site/Header.astro': ['---\nconst a = 1\n---\n<nav aria-label="Primary"></nav>\n', 1790291438],
  'components/ui/sheet.tsx': ['export const X = () => <span className="sr-only">Close</span>\n', 1790291438],
  'lib/locale-words.ts': ["export const WORDS = {\n  en: {\n    menu: 'Menu'\n  }\n}\n", 1790291438],
  'lib/media.ts': ['export const mediaUrl = (x) => x\n', 1790291438],
  'lib/env.d.ts': ['declare const x: string\n', 1790291438],
  'pages/[...path].astro': ['<main></main>\n', 1790291438],
  'huge.astro': ['x'.repeat(SITE_FILE_LIMITS.fileBytes + 1), 1790291438]
}

/**
 * A fake `docker exec` into `<label>-web-1`: answers the two scripts `site-files.js` runs — the
 * listing (`find … stat`) and the read (paths on stdin, each file base64-framed) — from `files`.
 */
function fakeContainer(files, calls = []) {
  return async ({ container, script, stdin }) => {
    calls.push({ container, script, stdin })
    if (container !== 'r1e1734-web-1') return { code: 1, stdout: Buffer.from('No such container') }
    if (/\bfind\b/.test(script)) {
      const lines = Object.entries(files).map(
        ([rel, [text, mtime]]) => `${Buffer.byteLength(text)} ${mtime} ./${rel}`
      )
      return { code: 0, stdout: Buffer.from(`${lines.join('\n')}\n`) }
    }
    const out = []
    for (const rel of String(stdin ?? '')
      .split('\n')
      .filter(Boolean)) {
      const held = files[rel]
      if (!held) out.push(`M ${rel}`, '')
      else out.push(`F ${rel}`, Buffer.from(held[0]).toString('base64'))
    }
    return { code: 0, stdout: Buffer.from(`${out.join('\n')}\n`) }
  }
}

async function emdashSite() {
  // The fleet's marks of an EmDash site: `data/` and `uploads/` under the private root, and a
  // webroot holding only those two binds.
  return tree({
    'sites/r1e1734/.webroot/data/.keep': '',
    'sites/r1e1734/.webroot/uploads/.keep': '',
    'private/r1e1734/data/.keep': '',
    'private/r1e1734/uploads/.keep': ''
  })
}

test('EmDash: the template source is read from the site container — markup and dictionaries only', async () => {
  const root = await emdashSite()
  const calls = []
  const config = { sitesRoot: path.join(root, 'sites'), privateRoot: path.join(root, 'private') }
  try {
    const read = await readSiteFiles({
      label: 'r1e1734',
      locale: 'en',
      config,
      exec: fakeContainer(EMDASH_SRC, calls)
    })
    assert.equal(read.status, 200)
    assert.equal(read.body.platform, 'emdash')
    assert.deepEqual(read.body.files.map((one) => one.path).sort(), [
      '/app/src/components/site/Breadcrumb.astro',
      '/app/src/components/site/Header.astro',
      '/app/src/components/ui/sheet.tsx',
      '/app/src/lib/locale-words.ts',
      '/app/src/pages/[...path].astro'
    ])
    assert.equal(
      read.body.files.find((one) => one.path.endsWith('Breadcrumb.astro')).text,
      EMDASH_SRC['components/site/Breadcrumb.astro'][0]
    )
    assert.deepEqual(read.body.images, [])
    // Every command ran in that site's own container, by argv, never a path the caller named.
    assert.ok(calls.every((one) => one.container === 'r1e1734-web-1'))

    // Asked again with the fingerprint it holds: only the listing runs, no file is read.
    const again = await readSiteFiles({
      label: 'r1e1734',
      locale: 'en',
      known: read.body.fingerprint,
      config,
      exec: fakeContainer(EMDASH_SRC, calls.splice(0))
    })
    assert.deepEqual(again.body, { platform: 'emdash', fingerprint: read.body.fingerprint, unchanged: true })

    // A file that moved changes the fingerprint.
    const moved = await readSiteFiles({
      label: 'r1e1734',
      locale: 'en',
      known: read.body.fingerprint,
      config,
      exec: fakeContainer({
        ...EMDASH_SRC,
        'components/site/Breadcrumb.astro': ['<nav aria-label="Crumbs"></nav>\n', 1790291999]
      })
    })
    assert.notEqual(moved.body.fingerprint, read.body.fingerprint)

    // Past the total: truncated, so the caller answers `incomplete`.
    const cut = await readSiteFiles({
      label: 'r1e1734',
      locale: 'en',
      config,
      exec: fakeContainer(EMDASH_SRC),
      limits: { totalBytes: 80 }
    })
    assert.equal(cut.body.truncated, true)
    assert.ok(cut.body.files.length < read.body.files.length)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('EmDash: a path a listing cannot vouch for is never read; a container that does not answer is 502', async () => {
  const root = await emdashSite()
  const config = { sitesRoot: path.join(root, 'sites'), privateRoot: path.join(root, 'private') }
  try {
    const calls = []
    const read = await readSiteFiles({
      label: 'r1e1734',
      locale: 'en',
      config,
      exec: fakeContainer(
        {
          'views/Home.astro': ['<p>Hi there</p>', 1],
          '../../run/tracy-agent.token.astro': ['secret', 1],
          'views/two\tpaths.astro': ['x', 1]
        },
        calls
      )
    })
    assert.deepEqual(
      read.body.files.map((one) => one.path),
      ['/app/src/views/Home.astro']
    )
    assert.equal(calls.at(-1).stdin, 'views/Home.astro\n')

    // A file listed and gone before the read ("M"): skipped, and the answer says it moved.
    const gone = await readSiteFiles({
      label: 'r1e1734',
      locale: 'en',
      config,
      exec: async (input) => {
        if (/\bfind\b/.test(input.script))
          return { code: 0, stdout: Buffer.from('10 1 ./views/Home.astro\n') }
        return { code: 0, stdout: Buffer.from('M views/Home.astro\n\n') }
      }
    })
    assert.deepEqual(gone.body.files, [])
    assert.equal(gone.body.truncated, true)

    const down = await readSiteFiles({
      label: 'r1e1734',
      locale: 'en',
      config,
      exec: async () => ({
        code: 1,
        stdout: Buffer.from('Error response from daemon: container is not running')
      })
    })
    assert.equal(down.status, 502)
    assert.equal(down.body.code, 'SITE_UNREADABLE')

    // A site with no template source at all (exit 3: no /app/src): EmDash, no files.
    const bare = await readSiteFiles({
      label: 'r1e1734',
      locale: 'en',
      config,
      exec: async () => ({ code: 3, stdout: Buffer.from('') })
    })
    assert.equal(bare.status, 200)
    assert.deepEqual(bare.body.files, [])
    assert.equal(bare.body.platform, 'emdash')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a webroot that is neither CMS and no EmDash mark: platform null, no container is asked', async () => {
  const root = await tree({
    'sites/odd/.webroot/index.html': '<p>hi</p>',
    'private/odd/.env': 'PLATFORM=joomla\n'
  })
  try {
    let asked = false
    const read = await readSiteFiles({
      label: 'odd',
      locale: 'en',
      config: { sitesRoot: path.join(root, 'sites'), privateRoot: path.join(root, 'private') },
      exec: async () => {
        asked = true
        return { code: 0, stdout: Buffer.from('') }
      }
    })
    assert.equal(read.body.platform, null)
    assert.equal(asked, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
