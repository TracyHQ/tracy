// A kit's capture in two passes: READ every page's DOM (read-pass.mjs), group the pages by layout on that reading
// (an assembled kit with no images: layouts, representatives, `shotOf`), then SHOOT only what the pack holds
// (shoot-pass.mjs). The images folder holds the pack's images and nothing else.
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { assembleKit, writeJson } from './assemble.mjs'
import { readSite } from './read-pass.mjs'
import { shootPages, shootPlan } from './shoot-pass.mjs'

/** A timer for one phase: `done()` logs `time <phase> <seconds>s` and returns the seconds. */
export function phase(log, name) {
  const t0 = Date.now()
  return {
    done: (...more) => {
      const s = Math.round((Date.now() - t0) / 100) / 10
      log('time', name, `${s}s`, ...more)
      return s
    }
  }
}

/**
 * @param {{o: object, out: string, tool: string, chromium: object, map: object, widths: number[], log: Function}} a
 * @returns {Promise<{capture: object, hide: string[]}>} the capture index (written to capture-index.json)
 */
export async function captureSite({ o, out, tool, chromium, map, widths, log }) {
  const hostHeader = typeof o['host-header'] === 'string' ? o['host-header'] : undefined
  const site = { chromium, siteUrl: o.site, hostHeader, map }
  // A new capture starts clean: no image of an earlier run is left to be mistaken for this one.
  rmSync(join(out, 'images'), { recursive: true, force: true })
  mkdirSync(join(out, 'images'), { recursive: true })
  let t = phase(log, 'read')
  const { hide, ...capture } = await readSite({
    ...site,
    widths,
    cap: Number(o['max-pages'] ?? 400),
    only: typeof o.only === 'string' ? o.only.split(',') : undefined,
    excludePaths: typeof o['exclude-path'] === 'string' ? o['exclude-path'].split(',') : []
  })
  t.done(capture.pages.length, 'pages x', widths.length, 'widths')
  t = phase(log, 'group')
  writeJson(join(out, 'capture-index.json'), capture)
  const kit = await assembleKit(o, out, tool)
  const plan = shootPlan(kit, capture)
  t.done(kit.blocks.filter((b) => b.shotOf).length, 'body blocks stand in for another')
  t = phase(log, 'shoot')
  const hideArg = { paths: hide, hosts: hostHeader ? [hostHeader] : [] }
  const { shots } = await shootPages({ ...site, out, capture, plan, hide: hideArg, log })
  capture.shots = shots
  t.done(shots, 'images')
  writeJson(join(out, 'capture-index.json'), capture)
  return { capture, hide }
}

/**
 * The shots a plan wants that the capture lacks, and the shots it holds that the plan no longer wants (a map that
 * regroups pages changes which page represents a group). Pure.
 * @returns {{missing: object, unwanted: Array<{kind: 'page'|'block', id: string, width: string, file: string}>}}
 */
export function planDiff(plan, capture) {
  const missing = {}
  const unwanted = []
  const pageOf = new Map(capture.pages.map((p) => [p.slug, p]))
  const wantedBlocks = new Set()
  for (const [w, at] of Object.entries(plan))
    for (const [slug, job] of Object.entries(at)) {
      const page = pageOf.get(slug)
      const need = {
        full: job.full && !page?.widths?.[w]?.full,
        blocks: job.blocks.filter((id) => !capture.blocks[id]?.widths?.[w]?.image)
      }
      for (const id of job.blocks) wantedBlocks.add(`${id}|${w}`)
      if (need.full || need.blocks.length) (missing[w] ??= {})[slug] = need
    }
  for (const p of capture.pages)
    for (const [w, at] of Object.entries(p.widths ?? {}))
      if (at.full && !plan[w]?.[p.slug]?.full)
        unwanted.push({ kind: 'page', id: p.slug, width: w, file: at.full })
  for (const b of Object.values(capture.blocks))
    for (const [w, at] of Object.entries(b.widths ?? {}))
      if (at.image && !wantedBlocks.has(`${b.id}|${w}`))
        unwanted.push({ kind: 'block', id: b.id, width: w, file: at.image })
  return { missing, unwanted }
}

/**
 * A reused capture brought in line with the current map: the plan is made again, what it lacks is shot (nothing
 * else), and what it no longer wants leaves the images folder and the capture, so the folder still holds only the
 * pack's images. Writes capture-index.json when anything changed.
 */
export async function reshootChanged({ o, out, tool, chromium, map, capture, hide, log }) {
  const hostHeader = typeof o['host-header'] === 'string' ? o['host-header'] : undefined
  writeJson(join(out, 'capture-index.json'), capture)
  const kit = await assembleKit(o, out, tool)
  const { missing, unwanted } = planDiff(shootPlan(kit, capture), capture)
  for (const u of unwanted) {
    const file = join(out, u.file)
    if (existsSync(file)) rmSync(file)
    if (u.kind === 'page') {
      const at = capture.pages.find((p) => p.slug === u.id).widths[u.width]
      delete at.full
      delete at.truncated
    } else delete capture.blocks[u.id].widths[u.width].image
  }
  const want = Object.values(missing).reduce((n, at) => n + Object.keys(at).length, 0)
  let shots = 0
  if (want)
    ({ shots } = await shootPages({
      chromium,
      siteUrl: o.site,
      hostHeader,
      map,
      out,
      capture,
      plan: missing,
      hide,
      log
    }))
  capture.shots = (capture.shots ?? 0) + shots - unwanted.length
  if (want || unwanted.length) writeJson(join(out, 'capture-index.json'), capture)
  log('reshoot', shots, 'new shots,', unwanted.length, 'dropped')
  return { shots, dropped: unwanted.length }
}
