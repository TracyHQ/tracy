#!/usr/bin/env node
/**
 * The frame surface of a kit (ADR 0043 section 3e) written as a file: for every picture frame, whether the block's text
 * sits over it and the overlay the template's own CSS paints over it, read from a quickstart installer zip. The bench
 * computes the same once per kit version (frame-surface/surface-cache.js); this script is for reading and measuring,
 * and its file is what the picture reading page takes as --surface.
 *
 *   node scripts/site-pictures-frame-surface.mjs --kit template-kit.json --content-map content-map.json \
 *     --quickstart <installer.zip> --out frame-surface.json [--kit-id <id>]
 *
 * Without --quickstart every overlay is "unknown"; the text over a picture is known from the kit alone.
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { measureSurface } from '../src/site-pictures/frame-surface/surface.js'
import { quickstartFilesOf } from '../src/site-pictures/frame-surface/surface-cache.js'

const USAGE =
  'usage: node scripts/site-pictures-frame-surface.mjs --kit <template-kit.json> --content-map <content-map.json> [--quickstart <installer.zip>] --out <file.json> [--kit-id <id>]'

export async function main(argv, io = { out: console.log, err: console.error }) {
  let values
  try {
    ;({ values } = parseArgs({
      args: argv,
      options: {
        kit: { type: 'string' },
        'content-map': { type: 'string' },
        quickstart: { type: 'string' },
        out: { type: 'string' },
        'kit-id': { type: 'string' }
      }
    }))
  } catch (error) {
    io.err(`${error.message}\n${USAGE}`)
    return 2
  }
  if (!values.kit || !values.out) {
    io.err(USAGE)
    return 2
  }
  try {
    const kit = JSON.parse(await readFile(values.kit, 'utf8'))
    const contentMap = values['content-map']
      ? JSON.parse(await readFile(values['content-map'], 'utf8'))
      : null
    let quickstart = null
    if (values.quickstart) {
      const bytes = await readFile(values.quickstart)
      quickstart = {
        file: path.basename(values.quickstart),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        files: quickstartFilesOf(bytes, kit?.template?.name)
      }
    }
    const kitId = values['kit-id'] ?? kit?.contract ?? null
    const surface = measureSurface({ kit, contentMap, quickstart, kitId })
    await writeFile(values.out, `${JSON.stringify(surface, null, 2)}\n`)
    const all = Object.values(surface.frames)
    const count = (f) => all.filter(f).length
    io.out(
      `wrote ${values.out}: ${all.length} frames, ${count((f) => f.overlay && f.overlay !== 'unknown')} with a template overlay, ${count((f) => f.overlay === null)} with none, ${count((f) => f.overlay === 'unknown')} unknown; text over ${count((f) => f.textOver)} (${count((f) => f.textOverFrom === 'derived')} derived); behind the title ${count((f) => f.behindTitle)}`
    )
    return 0
  } catch (error) {
    io.err(`site-pictures-frame-surface: ${error.message}`)
    return 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2))
