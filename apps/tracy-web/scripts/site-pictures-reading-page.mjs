#!/usr/bin/env node
/**
 * The picture reading page of the picture bench (#341): one HTML page, light and dark, built outside the server from
 * a run folder that "site-pictures-bench get" wrote. It makes no model call and needs no database.
 *
 *   node scripts/site-pictures-reading-page.mjs --run run-files --out reading.html [--photos photos] [--kit template-kit.json --webroot webroot]
 *
 * --photos is the folder of the owner's original photos the run was given (files named by their sha256); it lets the
 * page draw the cut area on each original. --kit is the template kit JSON and --webroot a folder that mirrors the
 * site's images/... (a quickstart webroot): a frame's demo picture is webroot + the frame's `picture`, and the finished
 * picture is drawn at the frame's width. --kit-images is only a fallback: a folder of images named after frame ids. Pictures are linked by a path relative to --out, so keep the page
 * and the folders where they are; a picture that is not found is shown as missing.
 */
import { parseArgs } from 'node:util'
import { buildPicturesPage } from '../src/site-pictures/reading-page/index.js'

const USAGE =
  'usage: node scripts/site-pictures-reading-page.mjs --run <run folder> --out <file.html> [--photos <folder>] [--kit <template-kit.json> --webroot <folder>] [--kit-images <folder>]'

export async function main(argv, io = { out: console.log, err: console.error }) {
  let values
  try {
    ;({ values } = parseArgs({
      args: argv,
      options: {
        run: { type: 'string' },
        out: { type: 'string' },
        photos: { type: 'string' },
        kit: { type: 'string' },
        webroot: { type: 'string' },
        'kit-images': { type: 'string' }
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
    const r = await buildPicturesPage({
      runDir: values.run,
      photosDir: values.photos ?? null,
      kitImagesDir: values['kit-images'] ?? null,
      kitFile: values.kit ?? null,
      webrootDir: values.webroot ?? null,
      outFile: values.out
    })
    io.out(`wrote ${values.out}: ${r.frames} frames, ${r.missing} files missing, ${r.bytes} bytes`)
    return 0
  } catch (error) {
    io.err(`site-pictures-reading-page: ${error.message}`)
    return 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2))
