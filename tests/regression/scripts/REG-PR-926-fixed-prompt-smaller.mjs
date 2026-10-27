/**
 * REG-PR-926-fixed-prompt-smaller: the fixed prompt every step re-sends is smaller and still
 * correct. Runs the case's six commands (a)–(f) and checks their counts and the one line (e) and
 * (f) print. The budgets in (c) and (d) are the tests' own assertions.
 */
import { checks, nodeTest, run } from './lib.mjs'

const c = checks()
const a = nodeTest(['packages/tools/tracy-site-tools/test/plain-reply.test.mjs'])
c.tapClean('(a)', a)
// PLAIN_REPLY names no look.revert; COMMENT_WRITES_ONLY still ends with the undo.
c.passes(
  '(a)',
  a,
  'V4S-3: a typed turn gets the plain-words rule; a comment turn keeps it inside its own rule'
)

const b = nodeTest(['packages/fleet/tracy-fleet-operation/test/site-folder.test.mjs'])
c.tapClean('(b)', b)
for (const name of [
  'a new AGENTS.md carries an empty team fence; the questions for the team are in the README',
  'topUpAgentsMd empties a hint block nobody filled, and keeps one the team filled',
  'a Joomla quickstart site gets the open brief, without the contract line the site context sends'
])
  c.passes('(b)', b, name)

// (c) is judged by the four tests the case was written on, not by a count: PR #1026 (no catalogue
// stub) and PR #1071 (the T4 build skill's modes) each added a test to the file.
const cat = nodeTest(['scripts/test/skill-catalog.test.mjs'])
c.tapClean('(c)', cat)
for (const name of [
  'every preset of both bundles cuts a catalog line at CAP characters',
  "Tracy's own skills fit a catalog line whole: the cut never lands in a Tracy description",
  'no preset lists a skill that needs an image-generation tool no preset has',
  'every preset catalog fits the budget, and the redesign path keeps its skill'
])
  c.passes('(c)', cat, name, 1, true)
c.tapClean('(d)', nodeTest(['scripts/test/tool-schema-budget.test.mjs']), { pass: 6 })

const e = run('pnpm', ['exec', 'tsx', 'scripts/gen-presets.ts', '--check'])
c.eq('(e) exit code', e.status, 0)
c.check(
  "(e) prints 'Preset gate: 4 files match the matrix.'",
  e.stdout.includes('Preset gate: 4 files match the matrix.'),
  `${e.stdout}${e.stderr}`.trim().slice(-400)
)
const f = run(process.execPath, ['scripts/build-agent-tools.mjs', '--check'])
c.eq('(f) exit code', f.status, 0)
c.check(
  "(f) prints 'agent-tools.json matches the site-tools plugin.'",
  f.stdout.includes('agent-tools.json matches the site-tools plugin.'),
  `${f.stdout}${f.stderr}`.trim().slice(-400)
)
c.done()
