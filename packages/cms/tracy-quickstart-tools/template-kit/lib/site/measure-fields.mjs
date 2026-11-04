// `cli.mjs measure-fields`: joins the measurement (field-drives.mjs) to a real site: the pages a field's entity shows
// on, the Joomla writer, and a browser reading each page for the marker.
import { execFileSync } from 'node:child_process'

import { openKitContext } from '../capture.mjs'
import { measurableFields, measureFieldDrives } from '../field-drives.mjs'
import { neutralKey } from '../ids.mjs'
import { urlOfPath } from '../kit-paths.mjs'
import { joomlaFieldWriter } from './adapters/joomla-field-writer.mjs'
import { prefixOf } from './adapters/joomla.mjs'
import { siteSource } from './adapters/source.mjs'
import { readFieldMarker } from './read-field-marker.js'

/** The kit pages a stored entity can print on: pages showing its block, its own page, the page listing it. */
export function pagesOfEntity(kit, map) {
  const blocksOf = new Map()
  for (const b of kit.blocks) {
    for (const e of [b.source?.entity, ...(b.source?.contains ?? [])].filter(Boolean))
      blocksOf.set(e, [...(blocksOf.get(e) ?? []), b.id])
    for (const l of b.lists ?? [])
      for (const item of l.shown ?? []) blocksOf.set(item, [...(blocksOf.get(item) ?? []), b.id])
  }
  return (field) => {
    const blocks = new Set(blocksOf.get(neutralKey(field.entity)) ?? blocksOf.get(field.entity) ?? [])
    const own = map.itemPages?.[field.entity]?.path?.replace(/^\/index\.php/, '')
    const pages = kit.pages.filter(
      (p) =>
        p.path === own ||
        Object.values(p.blocks ?? {})
          .flat()
          .some((id) => blocks.has(id))
    )
    return pages.map((p) => p.path)
  }
}

export async function runFieldMeasure({
  chromium,
  siteUrl,
  hostHeader,
  dbCommand,
  kit,
  map,
  log = () => {}
}) {
  const source = siteSource({ dbCommand })
  const prefix = prefixOf(source.query('SHOW TABLES').map((r) => Object.values(r)[0]))
  const [command, ...args] = dbCommand.trim().split(/\s+/)
  const writer = joomlaFieldWriter({
    prefix,
    entities: map.entities,
    // siteSource keeps every answer: a row read again gives the first bytes, which restore has put back by then.
    select: (sql) => source.query(sql),
    write: (sql) =>
      execFileSync(command, [...args, '--batch', '-e', sql], { stdio: ['ignore', 'ignore', 'pipe'] })
  })
  const browser = await chromium.launch()
  try {
    const ctx = await openKitContext(browser, { width: 1440, siteUrl, hostHeader, skip: ['image', 'media'] })
    const site = {
      set: writer.set,
      restore: writer.restore,
      read: async (path, marker) => {
        const page = await ctx.newPage()
        try {
          await page.goto(urlOfPath(path, siteUrl), { waitUntil: 'domcontentloaded', timeout: 60000 })
          const found = await page.evaluate(readFieldMarker, marker)
          return found.map((c) => ({ page: path, ...c }))
        } finally {
          await page.close()
        }
      }
    }
    return await measureFieldDrives({
      fields: measurableFields(map),
      pagesOf: pagesOfEntity(kit, map),
      site,
      log
    })
  } finally {
    await browser.close()
  }
}
