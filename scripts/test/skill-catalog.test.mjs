// The skill catalog every step of every conversation re-sends: what each of the twelve presets lists, and
// how long a line may be.
//
// WHY (bench flow D, 05/10/2026: 55 runs of the site agent on WordPress, Joomla and EmDash). dsh puts the
// catalog of a preset's skills in the conversation once and re-sends it on every step; on the Designer it
// was 6,695–7,506 characters — 21 to 24 lines of up to 500 characters each, the third-largest block of a
// step-1 prompt after the tool schemas and the site context — and 55 runs loaded a skill 5 times (all
// `emdash-site`). Two things cut it, and this test holds both:
//
// 1. A catalog line is a summary for choosing, not the skill: dsh's `tool-skill` cuts each description at
//    `catalogDescriptionMaxLength` (default 500). Every preset sets it to CAP. Tracy's own skills put
//    "Use when …" first and fit under it whole; a vendor skill keeps its first sentence or two.
// 2. A skill that needs a tool no Tracy mode has is listed by no preset: three image-generation skills
//    (brand boards, one design image per section, "generate the design image first, then code it") want
//    reference images handed back to the agent. The only picture door a mode has, `tracy_site media.draw`,
//    draws into a site's picture slot and uploads it there, so following them either does nothing or puts
//    design boards on the customer's site. A mode that gains a tool returning images lists them again.
//
// 3. No preset is sent a skill whose SKILL.md is only an OpenDesign catalogue entry — "This catalogue entry
//    advertises the skill … install the upstream bundle" (09/10/2026, harness-opt candidate 7): loading one
//    gives the agent no instruction at all. 24 rows of the matrix name such skills; none is in
//    `tracy-enabled.txt`, so the image installs none and no catalog carries them. Enabling one would put a
//    line in the catalog of every step that leads nowhere — bring the full skill into the tree instead.
//
// The redesign path keeps its skills: every preset still lists `tracy-design-inspiration` and
// `tracy-file-links`.

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parsePatch } from '../check-image-profile.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CAP = 200
/** The largest catalog any preset may send, in characters (6,695–7,506 on the Designer before). */
const BUDGET = 5300
/** What an OpenDesign SKILL.md says when it is only a catalogue entry for a skill kept upstream. */
const CATALOGUE_STUB = /This catalogue entry advertises the skill/
const PRESET_FILES = [
  'packages/bundle/tracy-cowork/presets.patch.yml',
  'packages/bundle/tracy-native/presets.patch.yml'
]
/** Skills that need an image-generation tool that returns images to the agent, which no preset has. */
const NEEDS_IMAGE_GENERATION = ['brandkit', 'imagegen-frontend-web', 'image-to-code-skill']

/** @type {Record<string, string[]>} */
const sets = JSON.parse(
  readFileSync(join(ROOT, 'packages/fleet/tracy-fleet-operation/dsh/skill-sets.json'), 'utf8')
).presets

/**
 * Where each skill the image installs lives — the same four sources as `scripts/gen-presets.ts`
 * (`installedSkills`) and the dsh Dockerfile.
 * @returns {Map<string, string>}
 */
function skillDirs() {
  const listed = (/** @type {string} */ file) =>
    readFileSync(join(ROOT, file), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
  /** @type {Map<string, string>} */
  const dirs = new Map()
  const first = (/** @type {string} */ name, /** @type {string[]} */ candidates) => {
    const hit = candidates.find((dir) => existsSync(join(ROOT, dir, 'SKILL.md')))
    if (hit !== undefined && !dirs.has(name)) dirs.set(name, hit)
  }
  for (const name of listed('vendor/tracy/od-skill/tracy-enabled.txt'))
    first(name, [`vendor/tracy/od-skill/skills/${name}`, `vendor/tracy/od-skill/design-templates/${name}`])
  for (const name of listed('packages/design/tracy-design-skill/matt-enabled.txt'))
    first(
      name,
      ['engineering', 'productivity', 'misc', 'in-progress'].map(
        (group) => `vendor/tracy/mattpocock-skills/skills/${group}/${name}`
      )
    )
  for (const name of readdirSync(join(ROOT, 'packages/design/tracy-design-skill/skills')))
    dirs.set(name, `packages/design/tracy-design-skill/skills/${name}`)
  first('joomlart-t4-template', ['vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template'])
  return dirs
}

/**
 * A skill's catalog entry, read from its `SKILL.md` front matter as dsh reads it; null when the skill is
 * not offered to the model (`disable-model-invocation: true`).
 * @param {string} dir
 * @returns {{ name: string, description: string } | null}
 */
function entryOf(dir) {
  const text = readFileSync(join(ROOT, dir, 'SKILL.md'), 'utf8')
  const head = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
  if (/^disable-model-invocation:\s*true\s*$/m.test(head)) return null
  const name = head.match(/^name:\s*['"]?([^'"\n]+)['"]?\s*$/m)?.[1] ?? ''
  const at = head.match(/^description:\s*(.*)$/m)
  let description = ''
  if (at) {
    const first = at[1].trim()
    if (/^[>|][-+]?$/.test(first)) {
      /** @type {string[]} */
      const lines = []
      for (const line of head.slice((at.index ?? 0) + at[0].length + 1).split('\n')) {
        if (/^\S/.test(line)) break
        lines.push(line.trim())
      }
      description = lines.join(' ')
    } else description = first.replace(/^['"]|['"]$/g, '')
  }
  return { name, description: description.replaceAll(/\s+/g, ' ').trim() }
}

/** The catalog dsh's `tool-skill` renders for a preset's skills, cut at `cap` (its `catalogDescription`). */
function catalog(/** @type {string[]} */ ids, /** @type {number} */ cap) {
  const dirs = skillDirs()
  const lines = ids
    .map((id) => (dirs.has(id) ? entryOf(/** @type {string} */ (dirs.get(id))) : null))
    .filter((entry) => entry !== null && entry.name !== '')
    .sort((a, b) => /** @type {any} */ (a).name.localeCompare(/** @type {any} */ (b).name))
    .map((entry) => {
      const { name, description } = /** @type {{ name: string, description: string }} */ (entry)
      const cut = description.length <= cap ? description : `${description.slice(0, cap - 3)}...`
      return `- \`${name}\`: ${cut}`
    })
  return lines.join('\n')
}

/**
 * Each preset row's `tool-skill` config, by preset id.
 * @param {string} file
 * @returns {Map<string, Record<string, unknown> | undefined>}
 */
function skillRowsOf(file) {
  const { rows, problems } = parsePatch(readFileSync(join(ROOT, file), 'utf8'), file)
  assert.deepEqual(problems, [])
  /** @type {Map<string, Record<string, unknown> | undefined>} */
  const out = new Map()
  for (const row of rows) {
    const insert = /** @type {any} */ (row).insert
    if (!Array.isArray(insert)) continue
    for (const entry of insert) {
      if (entry?.name !== '@deepseek-ai/dsh-agent-preset') continue
      const skill = (entry.config.plugins ?? []).find((/** @type {any} */ p) => p.id === 'tool-skill')
      assert.ok(skill, `${file}: ${entry.config.id} has no tool-skill row`)
      out.set(entry.config.id, skill.config)
    }
  }
  return out
}

test('every preset of both bundles cuts a catalog line at CAP characters', () => {
  for (const file of PRESET_FILES) {
    const presets = skillRowsOf(file)
    assert.equal(presets.size, 12, file)
    for (const [id, config] of presets)
      assert.equal(config?.catalogDescriptionMaxLength, CAP, `${file}: ${id}`)
  }
})

test("Tracy's own skills fit a catalog line whole: the cut never lands in a Tracy description", () => {
  const dirs = skillDirs()
  for (const name of readdirSync(join(ROOT, 'packages/design/tracy-design-skill/skills'))) {
    const entry = entryOf(/** @type {string} */ (dirs.get(name)))
    assert.ok(entry, name)
    assert.ok(entry.description.length <= CAP, `${name}: ${entry.description.length} > ${CAP}`)
  }
})

test('no preset lists a skill that needs an image-generation tool no preset has', () => {
  for (const [preset, ids] of Object.entries(sets))
    for (const id of NEEDS_IMAGE_GENERATION) assert.ok(!ids.includes(id), `${preset} lists ${id}`)
})

test('🔒 no preset is sent a catalogue stub: a skill whose SKILL.md only points upstream gives the agent nothing', () => {
  const dirs = skillDirs()
  for (const [preset, ids] of Object.entries(sets))
    for (const id of ids) {
      // The image links only installed skills into a preset's folder (Dockerfile `skill-sets`).
      const dir = dirs.get(id)
      if (dir === undefined) continue
      assert.doesNotMatch(
        readFileSync(join(ROOT, dir, 'SKILL.md'), 'utf8'),
        CATALOGUE_STUB,
        `${preset} lists ${id}, an OpenDesign catalogue entry with no instructions`
      )
    }
})

test('every preset catalog fits the budget, and the redesign path keeps its skill', () => {
  const rows = skillRowsOf(PRESET_FILES[0])
  for (const [preset, ids] of Object.entries(sets)) {
    // The cut the preset really sets; dsh's own default when it sets none.
    const cap = Number(rows.get(preset)?.catalogDescriptionMaxLength ?? 500)
    const lines = catalog(ids, cap)
    assert.ok(lines.length <= BUDGET, `${preset}: ${lines.length} > ${BUDGET}`)
    assert.ok(ids.includes('tracy-design-inspiration'), `${preset} keeps the redesign skill`)
    assert.ok(ids.includes('tracy-file-links'), `${preset} keeps the file-links skill`)
  }
})

// `joomlart-t4-template` BUILDS a T4 site or template from a design source: its intake asks for an HTML
// folder or a reference URL before anything else, and its `edit` scope is a template change (CSS, layout,
// overrides). Every Joomla mode carried it (26 KB, and its catalog line), so a Writer asked for a new FAQ or
// an SEO/GEO mode asked for a meta description could load it and open with that intake. The build skill
// stays with the modes that change a template: Designer and Developer (09/10/2026).
test('the T4 build skill goes to the Joomla modes that change a template, not to Writer or SEO/GEO', () => {
  for (const role of ['designer', 'developer'])
    assert.ok(sets[`${role}-joomla`].includes('joomlart-t4-template'), `${role}-joomla keeps it`)
  for (const role of ['writer', 'seo-geo'])
    assert.ok(!sets[`${role}-joomla`].includes('joomlart-t4-template'), `${role}-joomla drops it`)
  for (const platform of ['wordpress', 'emdash'])
    for (const role of ['designer', 'developer', 'writer', 'seo-geo'])
      assert.ok(!sets[`${role}-${platform}`].includes('joomlart-t4-template'), `${role}-${platform}`)
  // The other platform rows still reach every mode of their platform.
  for (const role of ['designer', 'developer', 'writer', 'seo-geo']) {
    assert.ok(
      sets[`${role}-joomla`].includes('t4-framework-knowledge'),
      `${role}-joomla t4-framework-knowledge`
    )
    assert.ok(sets[`${role}-emdash`].includes('emdash-site'), `${role}-emdash emdash-site`)
    assert.ok(sets[`${role}-wordpress`].includes('wpds'), `${role}-wordpress wpds`)
  }
})
