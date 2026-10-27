/**
 * Gate: the EmDash templates in `packages/cms/` carry a COPY of the skill kit's tools
 * (`vendor/emdash/tracy-emdash-skill`), and no repo can check that on its own — the kit lives in the
 * JoomlArt-Products repo, the templates here, and ADR 0006 forbids either depending on the other. Only TCH
 * sees all of them, so the agreement check lives in TCH. Same reason as `check-site-model`.
 *
 * 🔒 WHY A GATE, MEASURED 19/09/2026. Drift went the DANGEROUS way and nobody knew: both templates carried a
 * safety check in `tools/restore.sh` that the kit did NOT have, so every template `new-template.sh`
 * generated lacked it — restore could overwrite a direct child folder of `$HOME`, and the test suite's own
 * "dangerous path" case had created a `~/<folder>` holding the archive's `data.db`. Same review: `mega-hover`
 * swallowed a throwing `themeOf` in an empty `catch {}`, so a dark run drew light and still printed PASS —
 * the fix sat in one template, not in the kit or the other template. All three were fixes that **already
 * existed**, in the wrong place, and no measurement in the repo saw them.
 *
 * The gate calls the kit's own `scripts/check-kit-sync.mjs` — the ownership manifest (`kit-manifest.json`)
 * and the comparison rules belong to the kit, not to TCH. Here we only wire it up and collect the results.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const KIT = path.join(ROOT, 'vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template')
const CHECK = path.join(KIT, 'scripts/check-kit-sync.mjs')
const TEMPLATES = ['tracy-emdash-theme-base', 'tracy-emdash-theme-business', 'tracy-emdash-theme-saas']

if (!existsSync(CHECK)) {
  console.error(`check-emdash-kit-sync: ${path.relative(ROOT, CHECK)} is missing — did the kit change shape?`)
  process.exit(1)
}

let bad = 0
for (const t of TEMPLATES) {
  const target = path.join(ROOT, 'packages/cms', t)
  if (!existsSync(target)) {
    console.error(`  ${t}: no such folder`)
    bad++
    continue
  }
  let out: string
  let code = 0
  try {
    out = execFileSync('node', [CHECK, target], { encoding: 'utf8', cwd: ROOT })
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number }
    out = (err.stdout ?? '') + (err.stderr ?? '')
    code = err.status ?? 1
  }
  const summary = out.trim().split('\n').at(-1) ?? ''
  if (code === 0) {
    console.log(`  ${t}: ${summary}`)
    continue
  }
  bad++
  // Print every failing line, not just the exit code: the reader needs to know WHICH declaration changed, not "it drifted".
  console.error(`  ${t}: DRIFTED`)
  for (const line of out.split('\n'))
    if (/^(CODE DIFFERS|MISSING|UNPARSEABLE)/.test(line)) console.error(`      ${line}`)
  console.error(`      ${summary}`)
  console.error(
    `      → fix it in the KIT and copy it to the template, or — if the difference is intended — declare it in\n` +
      `        vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/kit-manifest.json`
  )
}

if (bad) {
  console.error(`\ncheck-emdash-kit-sync: ${bad}/${TEMPLATES.length} template(s) drifted from the kit.`)
  process.exit(1)
}
console.log(`check-emdash-kit-sync: ${TEMPLATES.length} templates match the kit.`)
