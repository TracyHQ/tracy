/**
 * Every compose file under `deploy/` must PARSE as YAML.
 *
 * 🔒 WHY A MACHINE, NOT A HUMAN EYE: exactly ONE thing reads these files — a `docker compose` run on the
 * server. So a syntax error in them only shows at a DEPLOY, at the end of a build, a push and a runner
 * queue. Measured 11/09 on an actual production deploy:
 *
 *   go-yaml load error in parser (while parsing a flow mapping) at L52.C14-C31:
 *   did not find expected ',' or '}'
 *
 * Cause: `tracy: { ipv4_address: ${VAR:-172.30.0}.10 }` — in flow-style YAML the `}` closing `${…}` also
 * closes the flow mapping. No gate in the repo parsed these files, so thirty green gates said nothing,
 * TWICE in a row, about a file that would not load.
 *
 * This gate does NOT run `docker compose config`: that needs Docker, and a gate that stands down when a
 * tool is missing reports the same green as a gate that ran. A YAML parse needs only the parser the repo
 * already has, and catches this whole class of error.
 *
 * Compose's two merge tags (`!reset`, `!override`) are not standard YAML tags so they are DECLARED here,
 * not ignored: an undeclared unknown tag must still be red, since it is almost certainly a typo of one of
 * these two.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'

const DIR = 'deploy'

/**
 * Compose's two merge tags. This repo's `js-yaml` rejects unknown tags, and 5.x's custom-tag API cannot
 * build a usable schema from outside — so they are STRIPPED from the text before parsing, after checking
 * that no tag OTHER than these two is present. Check first, then strip, rather than stripping anything
 * tag-like: a misspelled `!overide` must be red, since compose will refuse it, and the only thing worse
 * than a gate that does not catch something is a gate that teaches people it does.
 */
const COMPOSE_TAGS = new Set(['!reset', '!override'])
const TAG = /(?<=[:\s[,{-])(![A-Za-z_][\w-]*)/g

const files = readdirSync(DIR)
  .filter((f) => /^compose(\..+)?\.ya?ml$/.test(f))
  .map((f) => path.join(DIR, f))
  .sort()

if (files.length === 0) {
  console.error('check-compose-yaml: no compose files found under deploy/ — the glob or the layout changed')
  process.exit(1)
}

let failed = 0
for (const file of files) {
  const text = readFileSync(file, 'utf8')

  const unknown = [...new Set([...text.matchAll(TAG)].map((m) => m[1]))].filter((t) => !COMPOSE_TAGS.has(t))
  if (unknown.length > 0) {
    failed += 1
    console.error(
      `check-compose-yaml: ${file} carries unknown compose tags: ${unknown.join(', ')}\n` +
        `  only ${[...COMPOSE_TAGS].join(' and ')} are real tags; compose will refuse the rest`
    )
    continue
  }

  // Replace with spaces to keep column numbers — the parser's error names line:column, and it must point
  // at the right character in the real file.
  const stripped = text.replace(TAG, (m) => ' '.repeat(m.length))
  try {
    load(stripped)
    console.log(`check-compose-yaml: ${file} parses`)
  } catch (error) {
    failed += 1
    console.error(`check-compose-yaml: ${file} does NOT parse\n  ${(error as Error).message}`)
  }
}
process.exit(failed === 0 ? 0 : 1)
