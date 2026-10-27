#!/usr/bin/env node
/**
 * `installCowork` (WordPress) against a local fake wp-admin over real HTTP: the paths where the
 * site cannot write its plugins folder, where an update leaves the old version in place, and where
 * a firewall answers instead of wp-admin.
 *
 * The fake draws what WordPress draws for each step, cut to what the code reads: the Plugins
 * screen's activate/deactivate/upgrade links, the upload form's nonce, the "Connection Information"
 * form (`request-filesystem-credentials-form`), and the engine's `info` answer.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

let wordpress

before(async () => {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/host/wordpress.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    packages: 'external',
    write: false
  })
  wordpress = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
})

const OLD = '0.18.14'
const LATEST = '0.18.18'
const TOKEN = 'abcdefghijklmnop1234'
const PLUGIN = 'claude-cowork%2Fclaude-cowork.php'
const FS_FORM =
  '<form action="" method="post"><fieldset><legend>Connection Information</legend><div id="request-filesystem-credentials-form" class="request-filesystem-credentials-form"><input type="radio" name="connection_type" value="ftp" checked></div></fieldset></form>'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A fake wp-admin holding one plugin `state` ({ present, version }). `onUpgrade`, `onUpload`,
 * `onReplace`, `onPlugins`, `onActivate`, `onOptions` and `onEngine` replace that step's answer;
 * each gets `(res, state)`.
 */
async function fakeAdmin(state, opts = {}) {
  const hits = []
  const sockets = new Set()
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    for await (const _ of req);
    hits.push(`${req.method} ${url.pathname}${url.search}`)
    const p = url.pathname
    if (p === '/wp-admin/plugins.php') {
      if (url.searchParams.get('action') === 'activate') {
        if (opts.onActivate) return void opts.onActivate(res, state)
        state.present = 'active'
        return void res.writeHead(200).end('<html>Plugin activated.</html>')
      }
      if (opts.onPlugins) return void opts.onPlugins(res, state)
      const links = []
      if (state.present === 'active')
        links.push(`<a href="plugins.php?action=deactivate&amp;plugin=${PLUGIN}">Deactivate</a>`)
      if (state.present === 'inactive')
        links.push(`<a href="plugins.php?action=activate&amp;plugin=${PLUGIN}&amp;_wpnonce=n">Activate</a>`)
      if (state.present !== 'absent' && state.version !== LATEST)
        links.push(
          `<a href="update.php?action=upgrade-plugin&amp;plugin=${PLUGIN}&amp;_wpnonce=u">update now</a>`
        )
      return void res.writeHead(200, { 'content-type': 'text/html' }).end(`<html>${links.join('')}</html>`)
    }
    if (p === '/wp-admin/update-core.php') return void res.writeHead(200).end('<html>Updates</html>')
    if (p === '/wp-admin/update.php' && url.searchParams.get('action') === 'upgrade-plugin') {
      if (opts.onUpgrade) return void (await opts.onUpgrade(res, state))
      // What WordPress does: headers first, the upgrader's log streamed, the new version in place
      // only by the end of the page.
      res.writeHead(200, { 'content-type': 'text/html' })
      res.write('<html><h1>Update Plugin</h1><p>Downloading update…</p>')
      await sleep(300)
      state.version = LATEST
      state.present = 'active'
      return void res.end('<p>Plugin updated successfully.</p></html>')
    }
    if (p === '/wp-admin/plugin-install.php')
      return void res.writeHead(200).end('<form><input type="hidden" name="_wpnonce" value="abc123"></form>')
    if (p === '/wp-admin/update.php' && url.searchParams.get('action') === 'upload-plugin') {
      if (url.searchParams.get('overwrite') === 'update-plugin') {
        if (opts.onReplace) return void opts.onReplace(res, state)
        state.version = LATEST
        return void res.writeHead(200).end('<html>Plugin updated successfully.</html>')
      }
      if (opts.onUpload) return void opts.onUpload(res, state)
      if (state.present !== 'absent') {
        return void res
          .writeHead(200)
          .end(
            '<a href="update.php?action=upload-plugin&amp;package=9&amp;overwrite=update-plugin&amp;_wpnonce=o">Replace current with uploaded</a>'
          )
      }
      state.present = 'inactive'
      state.version = LATEST
      return void res.writeHead(200).end('<html>Plugin installed successfully.</html>')
    }
    if (p === '/wp-admin/options-general.php') {
      if (opts.onOptions) return void opts.onOptions(res, state)
      if (state.present !== 'active') return void res.writeHead(200).end('<html></html>')
      return void res
        .writeHead(200)
        .end(`<input type="text" id="claude_cowork_token" readonly value="${TOKEN}">`)
    }
    if (p === '/wp-admin/admin-ajax.php') {
      if (opts.onEngine) return void opts.onEngine(res, state)
      if (state.present !== 'active') return void res.writeHead(400).end('0')
      return void res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ok: true, info: { wordpress: '7.1.3', component: state.version } }))
    }
    if (p === '/package.zip') return void res.writeHead(200).end(Buffer.from('PK\u0003\u0004 fake zip'))
    res.writeHead(404).end('not found')
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    hits,
    session: {
      ok: true,
      cookie: 'wordpress_logged_in_x=1',
      authHeader: {},
      webRootUrl: base,
      adminUrl: `${base}/wp-admin`
    },
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    }
  }
}

async function install(state, opts, check) {
  const admin = await fakeAdmin(state, opts)
  try {
    const result = await wordpress.installCowork(admin.session, `${admin.base}/package.zip`, LATEST)
    await check(result, admin)
  } finally {
    await admin.close()
  }
}

test('a fresh install on a writable site still installs, activates and answers', async () => {
  const state = { present: 'absent' }
  await install(state, {}, (result) => {
    assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
  })
})

test('an old active plugin: the updater page is read to its end before the version is asked', async () => {
  const state = { present: 'active', version: OLD }
  await install(state, {}, (result, admin) => {
    assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
    assert.equal(
      admin.hits.some((h) => h.includes('upload-plugin')),
      false,
      'no upload needed'
    )
  })
})

test('the "Connection Information" form on upload of an absent plugin is fs_credentials_required', async () => {
  const state = { present: 'absent' }
  const onUpload = (res) =>
    void res.writeHead(200, { 'content-type': 'text/html' }).end(`<html>${FS_FORM}</html>`)
  await install(state, { onUpload }, (result) => {
    assert.deepEqual(result, { ok: false, reason: 'fs_credentials_required' })
  })
})

test('an old plugin whose updater asks for FTP details is fs_credentials_required, not a silent old version', async () => {
  const state = { present: 'active', version: OLD }
  const asksFtp = (res) =>
    void res.writeHead(200, { 'content-type': 'text/html' }).end(`<html>${FS_FORM}</html>`)
  await install(state, { onUpgrade: asksFtp, onReplace: asksFtp }, (result) => {
    assert.deepEqual(result, { ok: false, reason: 'fs_credentials_required' })
    assert.equal(state.version, OLD)
  })
})

test('an update that leaves the old version in place is upgrade_failed', async () => {
  const state = { present: 'active', version: OLD }
  // The updater and the replace both draw a page and change nothing — a folder WordPress cannot
  // replace, measured as a run that reported success with the old version.
  const nothing = (res) => void res.writeHead(200).end('<html>Updating…</html>')
  await install(state, { onUpgrade: nothing, onReplace: nothing }, (result) => {
    assert.deepEqual(result, { ok: false, reason: 'upgrade_failed', have: OLD, need: LATEST })
  })
})

test('a plugin the failed updater left deactivated is switched back on before the verdict', async () => {
  const state = { present: 'active', version: OLD }
  const deactivates = (res, s) => {
    s.present = 'inactive'
    res.writeHead(200).end('<html>Could not remove the old plugin.</html>')
  }
  await install(
    state,
    { onUpgrade: deactivates, onReplace: (res) => void res.writeHead(200).end('') },
    (result) => {
      assert.equal(state.present, 'active', 'reactivated')
      assert.deepEqual(result, { ok: false, reason: 'upgrade_failed', have: OLD, need: LATEST })
    }
  )
})

test('a firewall page on the Plugins screen is blocked_by_firewall, not unreachable', async () => {
  const state = { present: 'absent' }
  const onPlugins = (res) =>
    void res
      .writeHead(403, { 'content-type': 'text/html' })
      .end('<html>Your access to this site has been limited by the site owner. Generated by Wordfence</html>')
  await install(state, { onPlugins }, (result) => {
    assert.deepEqual(result, { ok: false, reason: 'blocked_by_firewall', firewall: 'wordfence' })
  })
})

const WORDFENCE_PAGE =
  '<html>Your access to this site has been limited by the site owner. Generated by Wordfence</html>'
const wordfence = (res) => void res.writeHead(403, { 'content-type': 'text/html' }).end(WORDFENCE_PAGE)
const BLOCKED = { ok: false, reason: 'blocked_by_firewall', firewall: 'wordfence' }

test('a plugin the customer left deactivated stays off when the upload fails', async () => {
  const state = { present: 'inactive', version: OLD }
  const onUpload = (res) => void res.writeHead(500).end('')
  await install(state, { onUpload }, (result, admin) => {
    assert.deepEqual(result, { ok: false, reason: 'install_failed' })
    assert.equal(state.present, 'inactive', 'not switched on')
    assert.equal(
      admin.hits.some((h) => h.includes('action=activate')),
      false,
      'the activate link was never followed'
    )
  })
})

test('a deactivated plugin replaced by a successful upload is switched on', async () => {
  const state = { present: 'inactive', version: OLD }
  await install(state, {}, (result) => {
    assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
  })
})

test('a firewall page on the activate link is blocked_by_firewall, not activate_failed', async () => {
  await install({ present: 'absent' }, { onActivate: wordfence }, (result) => {
    assert.deepEqual(result, BLOCKED)
  })
})

test('a firewall page on the settings page is blocked_by_firewall, not configure_failed', async () => {
  await install({ present: 'absent' }, { onOptions: wordfence }, (result) => {
    assert.deepEqual(result, BLOCKED)
  })
})

test('a firewall page on the engine call is blocked_by_firewall, not configure_failed', async () => {
  await install({ present: 'absent' }, { onEngine: wordfence }, (result) => {
    assert.deepEqual(result, BLOCKED)
  })
})

test('a firewall page on the Plugins screen after the upload is blocked_by_firewall', async () => {
  let views = 0
  const state = { present: 'absent' }
  const onPlugins = (res) => {
    views += 1
    if (views === 1) return void res.writeHead(200).end('<html></html>')
    wordfence(res)
  }
  await install(state, { onPlugins }, (result) => {
    assert.deepEqual(result, BLOCKED)
  })
})

// ── A refusal of the upload POST itself decides the outcome ────────────────────────────────

/** Whether the upload POST was the last request the site saw. */
const lastIsUpload = (hits) => /^POST \/wp-admin\/update\.php\?action=upload-plugin$/.test(hits.at(-1) ?? '')
const UPLOAD_PATH = '/wp-admin/update.php'
const WP_DIE_403 =
  '<!DOCTYPE html><html><body id="error-page"><div class="wp-die-message">The link you followed has expired.</div></body></html>'

for (const present of ['absent', 'inactive']) {
  test(`a 413 on the upload is upload_too_large and nothing is asked after it (plugin ${present})`, async () => {
    const onUpload = (res) =>
      void res
        .writeHead(413, { 'content-type': 'text/html' })
        .end('<title>413 Request Entity Too Large</title>nginx')
    await install({ present, version: OLD }, { onUpload }, (result, admin) => {
      assert.deepEqual(result, {
        ok: false,
        reason: 'upload_too_large',
        detail: { at: 'upload_install', check: 'too_large', status: 413, path: UPLOAD_PATH }
      })
      assert.ok(lastIsUpload(admin.hits), admin.hits.join('\n'))
    })
  })

  test(`a firewall's 403 on the upload stops there (plugin ${present})`, async () => {
    await install({ present, version: OLD }, { onUpload: wordfence }, (result, admin) => {
      assert.deepEqual(result, {
        ...BLOCKED,
        detail: { at: 'upload_install', check: 'server_denied', status: 403, path: UPLOAD_PATH }
      })
      assert.ok(lastIsUpload(admin.hits), admin.hits.join('\n'))
    })
  })

  test(`a web server's unsigned 403 on the upload is a firewall and stops there (plugin ${present})`, async () => {
    const onUpload = (res) =>
      void res.writeHead(403, { 'content-type': 'text/html' }).end('<h1>Forbidden</h1>')
    await install({ present, version: OLD }, { onUpload }, (result, admin) => {
      assert.deepEqual(result, {
        ok: false,
        reason: 'blocked_by_firewall',
        firewall: 'firewall',
        detail: { at: 'upload_install', check: 'server_denied', status: 403, path: UPLOAD_PATH }
      })
      assert.ok(lastIsUpload(admin.hits), admin.hits.join('\n'))
    })
  })

  test(`WordPress's own 403 on the upload is install_failed and stops there (plugin ${present})`, async () => {
    const onUpload = (res) => void res.writeHead(403, { 'content-type': 'text/html' }).end(WP_DIE_403)
    await install({ present, version: OLD }, { onUpload }, (result, admin) => {
      assert.deepEqual(result, {
        ok: false,
        reason: 'install_failed',
        detail: { at: 'upload_install', check: 'forbidden', status: 403, path: UPLOAD_PATH }
      })
      assert.ok(lastIsUpload(admin.hits), admin.hits.join('\n'))
    })
  })
}
