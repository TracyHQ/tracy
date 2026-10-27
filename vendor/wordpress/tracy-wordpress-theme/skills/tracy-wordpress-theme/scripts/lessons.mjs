#!/usr/bin/env node
// Past skill defects that apply to this port, one line each — and the full record of one on demand.
//
//   node scripts/lessons.mjs scan --spec <spec-pack> --theme <built theme> [--source <saved pages dir>] [--pack <dir>]
//   node scripts/lessons.mjs show <L-NNN>
//
// scan runs every detector of references/lessons.jsonl whose inputs were given and prints, on
// stdout, only `id · sym · fix` lines: the lessons whose trap is in these inputs and not handled
// (unresolved), then the process reminders every port carries (guidance). Resolved matches, the
// detectors left out for a missing optional input, and anything that could not be read go to
// stderr. Exit 0: nothing unresolved; 1: an unresolved lesson; 2: a usage error, an input that
// cannot be read, or a detector that could not decide — 2 wins over 1, never a clean 0.
// `--theme` is the theme WordPress loads (src/<slug>/ or the unzipped package), not the overlay.
// Every input is a directory on disk: the scan loads no page. `--source` is a saved copy of the
// source site (`wget --mirror --adjust-extension`); lessons only a running page shows name the
// tool that checks them (`tool`), and the scan lists them on stderr without running them.
// show prints the record and where to read more (the gotcha, the issue, the PR). Rules:
// references/lessons.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CatalogError, GOTCHAS_FILE, InputError, clean, inputRoot, loadCatalog, report, scan, showLines } from './lib/lessons.mjs'

const USAGE = [
  'usage: lessons.mjs scan --spec <spec-pack dir> --theme <built theme dir> [--source <saved source pages dir>] [--pack <quickstart pack dir>]',
  '       lessons.mjs show <L-NNN>'
].join('\n')
const SCAN_FLAGS = ['--spec', '--theme', '--source', '--pack']

/** argv after the subcommand → options; every problem is an InputError before anything is read. */
function parseScanArgs(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!SCAN_FLAGS.includes(a)) throw new InputError(`unknown argument ${JSON.stringify(clean(a, 60))}`)
    const key = a.slice(2)
    if (key in o) throw new InputError(`${a} given twice`)
    const v = argv[i + 1]
    if (v === undefined || v === '' || v.startsWith('--')) throw new InputError(`${a} needs a value`)
    o[key] = v
    i++
  }
  for (const k of ['spec', 'theme']) if (!o[k]) throw new InputError(`--${k} is required`)
  return {
    spec: inputRoot(o.spec, '--spec'),
    theme: inputRoot(o.theme, '--theme'),
    pack: o.pack ? inputRoot(o.pack, '--pack') : null,
    source: o.source ? inputRoot(o.source, '--source') : null
  }
}

export async function main(argv, { catalogFile, ...inject } = {}) {
  const out = { stdout: [], stderr: [], code: 0 }
  const fail = (msg, code = 2) => ({ stdout: [], stderr: [`lessons: ${clean(msg, 2000)}`, USAGE], code })
  try {
    const [cmd, ...rest] = argv
    if (cmd === 'show') {
      if (rest.length !== 1) return fail('show takes exactly one lesson id')
      if (!/^L-\d{3}$/.test(rest[0])) return fail(`${JSON.stringify(clean(rest[0], 40))} is not a lesson id (L-NNN)`)
      const catalog = loadCatalog(catalogFile)
      const r = catalog.find((x) => x.id === rest[0])
      if (!r) return fail(`no lesson ${rest[0]}`)
      let gotchas = null
      try {
        gotchas = fs.readFileSync(GOTCHAS_FILE, 'utf8')
      } catch {}
      out.stdout = showLines(r, { gotchas, catalog })
      return out
    }
    if (cmd !== 'scan') return fail(cmd ? `unknown command ${JSON.stringify(clean(cmd, 40))}` : 'a command is required')
    const opts = parseScanArgs(rest)
    const catalog = loadCatalog(catalogFile)
    const res = await scan({ ...opts, catalog, ...inject })
    return report(res)
  } catch (e) {
    if (e instanceof InputError || e instanceof CatalogError) return fail(e.message)
    return fail(`internal error: ${e.stack ?? e.message}`)
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { stdout, stderr, code } = await main(process.argv.slice(2))
  if (stdout.length) process.stdout.write(stdout.join('\n') + '\n')
  if (stderr.length) process.stderr.write(stderr.join('\n') + '\n')
  process.exitCode = code
}
