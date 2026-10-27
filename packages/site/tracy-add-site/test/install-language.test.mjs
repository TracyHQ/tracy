#!/usr/bin/env node
/**
 * `installCowork` on a Joomla whose backend does not speak English.
 *
 * Joomla translates "Installation of the package was successful" into the backend language, so a
 * success check that reads that sentence fails every non-English admin. Measured on production
 * 12/10/2026: the first real import (`coachingnvc.pl`, Joomla 6.1.4, admin in `pl-pl`) returned
 * `install_failed` while the install had worked. The run must ask the component instead.
 *
 * Same harness as `login-redirect.test.mjs`: the real module bundled with esbuild, `globalThis.fetch`
 * replaced by a fake Joomla that holds state (installed or not) across requests.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

let joomla
const realFetch = globalThis.fetch

async function bundle(entry) {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    packages: 'external',
    write: false
  })
  const source = Buffer.from(built.outputFiles[0].text).toString('base64')
  return import(`data:text/javascript;base64,${source}`)
}

before(async () => {
  joomla = await bundle('src/host/joomla.ts')
})

after(() => {
  globalThis.fetch = realFetch
})

const ROOT = 'https://example.test'
const ADMIN = `${ROOT}/administrator/index.php`
const CSRF = '0123456789abcdef0123456789abcdef'
const TOKEN = 'ab'.repeat(24)
const PACKAGE_URL = 'https://downloads.example.test/pkg_claudecowork-0.9.0.zip'
const LATEST = '0.9.0'
const POLISH_SUCCESS = 'Instalacja pakietu zakończyła się powodzeniem.'
const POLISH_FAILURE = 'Nie można zainstalować rozszerzenia.'

/**
 * A fake Joomla admin. `installs` says whether an install POST really installs; the flash message
 * after it is always in Polish, the way Joomla renders it (`<noscript>` fallback).
 */
function fakeJoomla({ installs }) {
  const state = { installed: false, posts: [] }
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET'
    let body = ''
    if (url === `${ADMIN}?option=com_installer&view=install`) {
      if (method === 'POST') {
        state.posts.push(init.body instanceof FormData ? 'upload' : 'url')
        if (installs) state.installed = true
        state.flash = installs ? POLISH_SUCCESS : POLISH_FAILURE
        return withUrl(new Response('', { status: 303, headers: { location: url } }), url)
      }
      const kind = state.flash === POLISH_SUCCESS ? 'success' : 'danger'
      const flash = state.flash
        ? `<noscript><div class="alert alert-${kind}">${state.flash}</div></noscript>`
        : ''
      state.flash = undefined
      body = `<html lang="pl-pl"><div id="system-message-container">${flash}</div><form><input type="hidden" name="${CSRF}" value="1"></form></html>`
    } else if (url.startsWith(`${ADMIN}?option=com_config`)) {
      body = state.installed
        ? `<input type="text" id="jform_token" name="jform[token]" value="${TOKEN}">`
        : '<html></html>'
    } else if (url.includes('option=com_claudecowork&task=api.exec')) {
      const sent = JSON.parse(init.body)
      body = JSON.stringify(
        state.installed && sent.token === TOKEN
          ? { ok: true, info: { component: LATEST } }
          : { message: 'not found' }
      )
      if (!state.installed) return withUrl(new Response(body, { status: 404 }), url)
    } else if (url === PACKAGE_URL) {
      return withUrl(new Response(new Uint8Array([80, 75, 3, 4])), url)
    } else {
      throw new TypeError(`fetch failed: no route for ${method} ${url}`)
    }
    return withUrl(new Response(body, { status: 200 }), url)
  }
  return state
}

function withUrl(response, url) {
  Object.defineProperty(response, 'url', { value: url })
  return response
}

const SESSION = { ok: true, cookie: 'joomla_session=abc', authHeader: {}, webRootUrl: ROOT }

test('a Polish backend that installed the component is a success, not install_failed', async () => {
  const state = fakeJoomla({ installs: true })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, { ok: true, token: TOKEN, version: LATEST })
  // The carried package installed, so the site's own download was never needed (#1568).
  assert.deepEqual(state.posts, ['upload'])
})

test('a Polish backend that really refused both doors is still install_failed', async () => {
  const state = fakeJoomla({ installs: false })
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'install_failed')
  assert.deepEqual(result.detail, {
    at: 'url_install',
    check: 'not_installed',
    status: 200,
    path: '/administrator/index.php',
    // Each road's answers ride along: both POSTs redirected and both result pages said 200.
    roads: {
      url_install: { post_status: 303, result_status: 200 },
      upload_install: { post_status: 303, result_status: 200 }
    },
    package_bytes: 4
  })
  assert.deepEqual(state.posts, ['upload', 'url'])
})

const JOOMLA_DENIED_PAGE =
  '<html><head><link href="/media/templates/administrator/atum/css/template.min.css" rel="stylesheet"></head>' +
  '<body><div class="alert">You do not have permission to view this resource.</div></body></html>'

test('an account the Extension Manager refuses (403) is install_forbidden, not unreachable', async () => {
  // Joomla 6.2.0, an Administrator who is not a Super User: the backend opens, the installer 403s.
  const seen = []
  globalThis.fetch = async (url, init = {}) => {
    seen.push(`${init.method ?? 'GET'} ${url}`)
    if (url.startsWith(`${ADMIN}?option=com_config`)) {
      return withUrl(new Response('You do not have permission to view this resource.', { status: 403 }), url)
    }
    if (url === `${ADMIN}?option=com_installer&view=install`) {
      // Joomla renders its own refusal inside the admin template; a bare 403 is a server rule.
      return withUrl(new Response(JOOMLA_DENIED_PAGE, { status: 403 }), url)
    }
    throw new TypeError(`fetch failed: no route for ${init.method ?? 'GET'} ${url}`)
  }
  const result = await joomla.installCowork(SESSION, PACKAGE_URL, LATEST)
  assert.deepEqual(result, {
    ok: false,
    reason: 'install_forbidden',
    detail: { at: 'install_page', check: 'joomla_denied', status: 403, path: '/administrator/index.php' }
  })
  // Nothing was posted: the refusal is read before any install is attempted.
  assert.ok(seen.every((line) => line.startsWith('GET ')))
})
