// A WordPress stand carries the host name the preview probes open (preview-check/host-named.mjs), so
// WordPress does not redirect the probe's localhost address back to 127.0.0.1; Joomla keeps 127.0.0.1.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { hostNamedAddress } from '../../../../apps/tracy-web/scripts/preview-check/host-named.mjs'
import { standAddressOf } from '../src/stand-address.mjs'

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('a WordPress stand is addressed where the preview probe opens it', () => {
  const site = standAddressOf('wordpress', 52995)
  assert.equal(site, 'http://localhost:52995')
  // the probe reads the stand at the address it is given, host-named: the two must be the same origin
  assert.equal(new URL(hostNamedAddress(`${site}/`)).origin, new URL(site).origin)
  assert.equal(
    new URL(hostNamedAddress('http://127.0.0.1:52995/')).origin,
    new URL(site).origin,
    'the /ops command hands preview-check 127.0.0.1, which it reads at localhost'
  )
})

test('a Joomla stand keeps 127.0.0.1', () => {
  assert.equal(standAddressOf('joomla', 52981), 'http://127.0.0.1:52981')
})

test('stand.mjs takes the site address from standAddressOf', () => {
  const src = readFileSync(join(PKG, 'scripts/stand.mjs'), 'utf8')
  assert.match(src, /const url = standAddressOf\(platform, port\)/)
})
