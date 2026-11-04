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
 *
 * --copy is a site-copy/1 file of the site writer (ADR 0042): every card then also shows the text the writer decided
 * for the block the picture sits in, the text of the same card, the block's role in the plan and the picture's alt.
 *
 * With --kit and its shots (the kit pack's images, found in --kit-images or at the paths the kit lists), every card
 * also shows where the frame sits on the template: the page shot cropped around the frame's box, outlined, beside the
 * same crop with the finished picture in the box. Those crops are small JPEGs written to "<out name>-where/" beside
 * the page; a frame whose box cannot be placed on a shot says "position not measured".
 */
import { parseArgs } from 'node:util'
import { buildPicturesPage } from '../src/site-pictures/reading-page/index.js'

const USAGE =
  'usage: node scripts/site-pictures-reading-page.mjs --run <run folder> --out <file.html> [--photos <folder>] [--kit <template-kit.json> --webroot <folder>] [--kit-images <folder>] [--copy <site-copy.json>]'

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
        'kit-images': { type: 'string' },
        copy: { type: 'string' }
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
      copyFile: values.copy ?? null,
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
