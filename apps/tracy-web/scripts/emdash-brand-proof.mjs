#!/usr/bin/env node
/**
 * One real write of the brand stage's EmDash orders against a LOCAL EmDash site, then a read back through the same
 * actions: `settings.logo`, `settings.favicon` and the chrome entry's `logo_dark` field. For a throwaway site built from
 * the theme (`tools/clean-install.sh`), never one in use: it changes the site's logo, favicon and dark logo.
 *
 *   node apps/tracy-web/scripts/emdash-brand-proof.mjs --site http://127.0.0.1:4361 --token-file <data/tracy-agent.token>
 *
 * Exit: 0 every order written and read back as ordered, 1 otherwise, 2 usage.
 */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { brandAsker, writeBrand } from '../src/write-step/brand-writes.js'
import { emdashBrandDoor } from '../src/write-step/emdash-brand-door.js'

const { values: v } = parseArgs({ options: { site: { type: 'string' }, 'token-file': { type: 'string' } } })
if (!v.site || !v['token-file']) {
  console.error('usage: emdash-brand-proof.mjs --site <url> --token-file <file>')
  process.exit(2)
}
const token = readFileSync(v['token-file'], 'utf8').trim()
const site = v.site.replace(/\/$/, '')

async function api(method, route, body) {
  const res = await fetch(`${site}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'X-EmDash-Request': '1',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || json?.success === false)
    throw new Error(`${method} ${route} -> ${res.status} ${json?.error?.message ?? ''}`)
  return json?.data ?? json
}

// Three different 8x8 PNGs (one colour each), so each place holds a picture of its own.
const png = (rgb) => {
  const zlib = require_zlib()
  const crc = (buf) => {
    let c
    let crcv = 0xffffffff
    for (const b of buf) {
      c = (crcv ^ b) & 0xff
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcv = (crcv >>> 8) ^ c
    }
    return (crcv ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc(body), 8 + data.length)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(8, 0)
  ihdr.writeUInt32BE(8, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 8 }, () => rgb).flat())])
  const raw = Buffer.concat(Array.from({ length: 8 }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}
import zlib from 'node:zlib'
function require_zlib() {
  return zlib
}

const pictures = new Map([
  ['logo.png', png([200, 30, 30])],
  ['logo-dark.png', png([240, 240, 240])],
  ['favicon.png', png([30, 30, 200])]
])
const orders = [
  {
    item: 'logo',
    slot: 'logo-header-1',
    spot: 'logo-header-1',
    file: 'logo.png',
    via: 'emdash-setting',
    key: 'settings.logo'
  },
  {
    item: 'logo',
    slot: 'logo-header-2',
    spot: 'logo-header-2',
    file: 'logo-dark.png',
    via: 'emdash-setting',
    key: 'chrome.logo_dark'
  },
  {
    item: 'favicon',
    slot: 'favicon-setting',
    file: 'favicon.png',
    via: 'emdash-setting',
    key: 'settings.favicon'
  }
]

const door = emdashBrandDoor({ api, siteUrl: site, token })
const ask = brandAsker({
  apply: (call) => door(call.action, call.params),
  siteKey: 'local',
  applyId: 'proof-1',
  sleep: async () => {}
})
const results = new Map()
await writeBrand({ orders, plan: {}, pictures, accent: null, ask, results })

let bad = 0
for (const order of orders) {
  const r = results.get(order)
  let back = null
  if (r?.status === 'written') {
    const answer = await door(r.readFrom.action, r.readFrom.params)
    back = r.readFrom.path.reduce((x, k) => x?.[k], answer)
  }
  const same = r?.status === 'written' && back === r.ordered
  if (!same) bad++
  console.log(
    `${order.key.padEnd(18)} ${r?.status} ordered=${r?.ordered} readBack=${back} ${same ? 'SAME' : `DIFFERENT ${r?.reason ?? ''}`}`
  )
}
const page = await (await fetch(`${site}/`)).text()
console.log('page icon link  :', /<link[^>]*rel="icon"[^>]*>/.exec(page)?.[0] ?? 'none')
console.log(
  'page logo images:',
  [...page.matchAll(/<img[^>]*site-logo[^>]*>/g)].map((m) => m[0].slice(0, 140))
)
process.exit(bad ? 1 : 0)
