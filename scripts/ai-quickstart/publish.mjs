#!/usr/bin/env node
/**
 * Publish an AI quickstart beside its human quickstart (ticket #588), through `publishVerified` (`publish/publish-step.mjs`).
 *
 *   GATE_TOKEN_FILE=<file> node scripts/ai-quickstart/publish.mjs <AI quickstart folder> \
 *     --human-quickstart <pinned human quickstart .zip> --out <new folder> [--upload] [--offline] [gate flags]
 *
 * The gate flags (`--site`, `--reset-site`, `--human-site`, `--human-control`, `--quality-control`,
 * `--quality-baseline`, `--plugin`, `--contract`, `--demo-content`, `--no-gitleaks`) go to `gate/gate.mjs`, which runs
 * into `<out>/gate-run` with `--into-kit` on the blank site archive this command made in `<out>/blank`. A dry run (the
 * default) writes the asset set into `<out>/assets` and the pin into `<out>/pin.json`, and prints which release would
 * get them; `--upload` sends them with `gh release upload` and writes the pin into the pins file beside the kits.
 * `--offline` does not read the release (a dry run only). Exit 0 published (or, dry, would be), 1 refused, 2 usage.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { publishKit } from './publish/publish-step.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const GATE_FLAGS = ['--site', '--reset-site', '--human-site', '--human-control', '--quality-control']
GATE_FLAGS.push('--quality-baseline', '--plugin', '--contract', '--demo-content')
const argv = process.argv.slice(2)
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null)
const folder = argv.find((a, i) => !a.startsWith('-') && !argv[i - 1]?.startsWith('--'))
const human = flag('--human-quickstart')
const out = flag('--out') ? path.resolve(flag('--out')) : null
if (!folder || !existsSync(folder) || !human || !out) {
  console.error(
    'usage: publish.mjs <AI quickstart folder> --human-quickstart <zip> --out <folder> [--upload]'
  )
  process.exit(2)
}
const upload = argv.includes('--upload')
const forwarded = GATE_FLAGS.flatMap((f) => (flag(f) ? [f, flag(f)] : []))
if (argv.includes('--no-gitleaks')) forwarded.push('--no-gitleaks')

const deps = {
  log: (line) => console.log(line),
  gh: argv.includes('--offline') ? null : (args) => execFileSync('gh', args, { encoding: 'utf8' }),
  buildBlankSite: async ({ human: zip, folder: kit, out: dir }) => {
    const [slug, , version] = path.resolve(kit).split(path.sep).slice(-3)
    const file = path.join(dir, 'blank', slug + '-blank-' + version + '.zip')
    mkdirSync(path.dirname(file), { recursive: true })
    const step = path.join(ROOT, 'scripts/ai-quickstart/blank-site.mjs')
    execFileSync(process.execPath, [step, zip, '--out', file, '--mapping', path.join(kit, 'mapping.json')], {
      stdio: 'inherit'
    })
    return file
  },
  runGate: async ({ folder: kit, human: zip, installer, runDir }) => {
    const gate = path.join(ROOT, 'scripts/ai-quickstart/gate/gate.mjs')
    const args = [
      gate,
      kit,
      '--human-quickstart',
      zip,
      '--installer',
      installer,
      '--out',
      runDir,
      '--into-kit'
    ]
    const run = spawnSync(process.execPath, [...args, ...forwarded], { stdio: 'inherit' })
    const file = path.join(runDir, 'check-record', 'record.json')
    if (!existsSync(file))
      throw new Error('the gate wrote no record (exit ' + run.status + '): see ' + runDir)
    return { record: JSON.parse(readFileSync(file, 'utf8')) }
  }
}

const r = await publishKit({ folder, human, out, root: ROOT, upload, deps })
if (!r.published) {
  console.error('publish refused:\n' + r.problems.map((p) => '  ' + p.code + ': ' + p.message).join('\n'))
  process.exit(1)
}
const to = r.release.tag + ' of ' + r.release.repo
console.log((upload ? 'uploaded to ' : 'dry run, nothing uploaded; would upload to ') + to + ':')
for (const a of r.assets) console.log('  ' + a.name + '  ' + a.bytes + ' bytes  sha256 ' + a.sha256)
console.log(
  (upload ? 'pinned ' : 'pin it would write (' + path.join(out, 'pin.json') + '): ') + JSON.stringify(r.pin)
)
