#!/usr/bin/env node
/**
 * The copy reading page of the site writer bench (#333): one self-contained HTML page, light and dark, built outside
 * the server from a run folder that "site-writer-bench get" wrote and a folder of the kit's block images. It makes no
 * model call and needs no database.
 *
 *   node scripts/site-writer-reading-page.mjs --run run-files --kit-images kit-images --out reading.html [--link-images]
 *     [--kit template-kit.json]
 *
 * Images are embedded as data URIs unless --link-images is given (then the page points at the files by a path
 * relative to --out). A block's image is the file in --kit-images whose name holds the block id and 1440. With --kit
 * (the run's template-kit.json), each block also shows the kit's lists row by row, and the page lists every text slot
 * of a kept block that is neither written nor hidden.
 */
import { parseArgs } from 'node:util'
import { buildReadingPage } from '../src/site-writer/reading-page/index.js'

const USAGE =
  'usage: node scripts/site-writer-reading-page.mjs --run <run folder> --kit-images <folder> --out <file.html> [--link-images] [--kit <template-kit.json>]'

export async function main(argv, io = { out: console.log, err: console.error }) {
  let values
  try {
    ;({ values } = parseArgs({
      args: argv,
      options: {
        run: { type: 'string' },
        'kit-images': { type: 'string' },
        out: { type: 'string' },
        'link-images': { type: 'boolean' },
        kit: { type: 'string' }
      }
    }))
  } catch (error) {
    io.err(`${error.message}\n${USAGE}`)
    return 2
  }
  if (!values.run || !values.out) {
    io.err(USAGE)
    return 2
  }
  try {
    const r = await buildReadingPage({
      runDir: values.run,
      imagesDir: values['kit-images'] ?? null,
      outFile: values.out,
      linkImages: values['link-images'] === true,
      kitFile: values.kit ?? null
    })
    io.out(`wrote ${values.out}: ${r.blocks} blocks, ${r.images} with an image, ${r.bytes} bytes`)
    return 0
  } catch (error) {
    io.err(`site-writer-reading-page: ${error.message}`)
    return 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2))
