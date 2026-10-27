#!/usr/bin/env node
/**
 * node packages/design/tracy-ds-slot/scripts/ds-slot.mjs apply <id> --emdash <dataDir> [--template emdash-<name>]   write the slot
 *                                                         clear      --emdash <dataDir>   remove it
 *                                                         profile <id>                    print the profile
 * `<id>` is `refero:<uuid>` or `od:<id>`. The same two calls the build tools make on a site.
 */
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emdashCss } from '../src/emit.mjs'
import { contractBase, googleFontFaces, loadContract, loadProfile } from '../src/library.mjs'
import { wordpressVariation } from '../src/wordpress.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { fontsHref } from '../src/emit.mjs'
import { gate } from '../src/normalise.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const [cmd, ...rest] = process.argv.slice(2)
const flag = (n) => {
  const i = rest.indexOf(n)
  return i === -1 ? null : rest[i + 1]
}
const dir = flag('--emdash')
const t0 = performance.now()

if (cmd === 'profile') {
  const p = loadProfile(ROOT, rest[0])
  console.log(JSON.stringify({ ...p, gate: gate(p) }, null, 2))
} else if (cmd === 'apply' && dir) {
  const p = loadProfile(ROOT, rest[0])
  // an EmDash template names its contract (`--template emdash-<name>`); none = the emitter's defaults
  const r = emdashCss(p, flag('--template') ? loadContract(flag('--template')) : {})
  if ('refused' in r) {
    console.error(`refused: ${r.refused.join(', ')}`)
    process.exit(2)
  }
  mkdirSync(dir, { recursive: true })
  // Written beside and renamed over: a request never reads a half-written sheet.
  const tmp = join(dir, `.ds-slot.css.${process.pid}`)
  writeFileSync(tmp, r.css)
  renameSync(tmp, join(dir, 'ds-slot.css'))
  console.log(
    JSON.stringify({
      ok: true,
      id: p.id,
      name: p.name,
      vars: Object.keys(r.vars).length,
      flags: p.flags,
      adjusted: r.adjusted,
      ms: Math.round(performance.now() - t0)
    })
  )
} else if (cmd === 'wordpress') {
  // the variation a WordPress site wears: written to --out, or printed
  const p = loadProfile(ROOT, rest[0])
  const contract = loadContract(flag('--template') ?? 'wordpress-tracy-base')
  const r = wordpressVariation(p, contractBase(ROOT, contract), contract, {
    fontFaces: await googleFontFaces(fontsHref(p))
  })
  if ('refused' in r) {
    console.error(`refused: ${r.refused.join(', ')}`)
    process.exit(2)
  }
  const out = flag('--out')
  const json = `${JSON.stringify(r.variation, null, 1)}\n`
  if (out) {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, json)
  } else process.stdout.write(json)
  if (out)
    console.log(
      JSON.stringify({
        ok: true,
        id: p.id,
        slug: r.slug,
        name: r.name,
        adjusted: r.adjusted,
        ms: Math.round(performance.now() - t0)
      })
    )
} else if (cmd === 'joomla') {
  // the HTML the site module carries: written to --out, or printed
  const p = loadProfile(ROOT, rest[0])
  const contract = loadContract(flag('--template') ?? 'joomla-tracy-base')
  const r = joomlaSlot(p, contractBase(ROOT, contract), contract)
  if ('refused' in r) {
    console.error(`refused: ${r.refused.join(', ')}`)
    process.exit(2)
  }
  const out = flag('--out')
  if (out) {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, r.html)
    console.log(
      JSON.stringify({
        ok: true,
        id: p.id,
        name: p.name,
        module: contract.module,
        bytes: r.html.length,
        adjusted: r.adjusted,
        ms: Math.round(performance.now() - t0)
      })
    )
  } else process.stdout.write(r.html)
} else if (cmd === 'clear' && dir) {
  const f = join(dir, 'ds-slot.css')
  if (existsSync(f)) rmSync(f)
  console.log(JSON.stringify({ ok: true, cleared: true, ms: Math.round(performance.now() - t0) }))
} else {
  console.error('usage: ds-slot.mjs apply <id> --emdash <dir> | clear --emdash <dir> | profile <id>')
  process.exit(1)
}
