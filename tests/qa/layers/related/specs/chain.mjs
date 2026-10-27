// Producer -> artifact -> TCH consumer cases. The producer is the code TCH itself vendors and pins (so these run without
// a sibling clone and judge exactly the commit TCH ships); the consumer is the real TCH release code.
//
// Chain 1 (WordPress): the release tool's own `settingFromTemplate` writes a tracy_setting.json; TCH's local-pack reader
//   and validator must accept it for the pack it describes, and the tool must refuse a template of another port.
// Chain 2 (EmDash): the kit's qa-contract validator and TCH's copy of it must both accept each theme's committed
//   qa.contract.json and both reject a skeleton with pending decisions or another schema version.
// Chain 3 (pins): the commit TCH's IMPORT-NOTE pins must exist in, and be an ancestor of, the producer clone.
// Oracle: ADR 0017 (the setting pins the release's own files by name and sha256; the reader checks them), the EmDash
// producer's own header ("a skeleton cannot validate until pending is empty"), ADR 0006 / CLAUDE.md §1 (vendor pins).
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { HarnessError } from '../../cms/lib/kit.mjs'
import { load, observe, sha256Hex, withTempDir } from '../../cms/lib/helpers.mjs'
import { cloneHas, isAncestor, resolveRoot } from '../lib/clone.mjs'
import { BoundedReadError, readTextAsync } from '../../../lib/bounded-reader.mjs'

const ADR17 = 'docs/adr/0017-github-release-is-quickstart-source-of-truth.md'
const ADR6 = 'docs/adr/0006-plugins-as-pinned-subtrees.md'
const ok = (value, detail) => ({ ok: Boolean(value), detail })

export const WP_RELEASE =
  'vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/scripts/quickstart/release.mjs'
export const EMDASH_PRODUCER =
  'vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/tools/qa-contract.mjs'
export const THEMES = Object.freeze(['base', 'business', 'saas'])
export const PINS = Object.freeze({
  'wordpress-theme': {
    repo: 'tracy-wordpress-theme',
    note: 'vendor/wordpress/tracy-wordpress-theme/IMPORT-NOTE.md',
    re: /(?:ghim tại|pinned at) commit \*\*`([0-9a-f]{7,40})`\*\*/
  },
  'joomla-template': {
    repo: 'tracy-joomla-template',
    note: 'vendor/joomla/joomlart-t4-skill/IMPORT-NOTE.md',
    re: /(?:ghim tại|pinned at) commit \*\*`([0-9a-f]{7,40})`\*\*/
  },
  'emdash-template': {
    repo: 'tracy-emdash-template',
    note: 'vendor/emdash/tracy-emdash-skill/IMPORT-NOTE.md',
    re: /tracy-emdash-template@([0-9a-f]{7,40})/
  }
})

const mutation = (id, describe, file, find, replace) => ({
  id,
  kind: 'product',
  describe,
  copy: [file],
  files: [{ path: file, find, replace }]
})

/** Cut `export function <name>(...) {...}` out of a module by brace matching, so a producer that cannot be imported whole (a missing browser dependency) can still be judged for the one pure function the chain needs. */
export function extractFunction(text, name) {
  const start = text.indexOf(`export function ${name}(`)
  if (start < 0) throw new HarnessError(`the producer has no export function ${name}`)
  const open = text.indexOf('{', text.indexOf(')', start))
  let depth = 0
  let inString = null
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') i += 1
      else if (ch === inString) inString = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') inString = ch
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1).replace(/^export /, '')
    }
  }
  throw new HarnessError(`unbalanced braces while reading ${name}`)
}

/** The producer's own helper definitions the function leans on, copied by line from the same file. */
function helperLines(text, names) {
  return names.map((n) => {
    const m = new RegExp(`^const ${n} = .*$`, 'm').exec(text)
    if (!m) throw new HarnessError(`the producer no longer defines ${n}`)
    return m[0]
  })
}

async function producerSetting(ctx) {
  const text = await readTextAsync(path.join(ctx.root, WP_RELEASE))
  const source = `${helperLines(text, ['obj', 'SETTING_FILE', 'slugOf']).join('\n')}\n${extractFunction(text, 'settingFromTemplate')}\nexport { settingFromTemplate }\n`
  const dir = path.join(ctx.outDir, 'tmp')
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `producer-${sha256Hex(source).slice(0, 12)}-${process.pid}.mjs`)
  await fs.writeFile(file, source)
  try {
    return (await import(pathToFileURL(file).href)).settingFromTemplate
  } catch (error) {
    throw new HarnessError(`cannot load the extracted producer function: ${error.message}`)
  } finally {
    await fs.rm(file, { force: true })
  }
}

const WEBROOT = Buffer.from('chain webroot bytes')
const DATABASE = Buffer.from('chain database bytes')
const manifest = () => ({
  id: 'quickstart/ja-qa/wp7',
  platform: 'wordpress',
  version: '1.2.0',
  wpVersion: '7.1',
  webroot: { file: 'ja-qa-wp7-webroot-1.2.0.tar.gz', sha256: sha256Hex(WEBROOT) },
  database: { file: 'ja-qa-wp7-database-1.2.0.sql.gz', sha256: sha256Hex(DATABASE) }
})
const template = (over = {}) => ({
  schemaVersion: 'tracy-setting/v1',
  platform: 'wordpress',
  label: 'JA QA',
  version: '1.0.0',
  cms: '7.0',
  template: 'ja-qa',
  install: {
    webroot: { file: 'ja-qa-wp7-webroot-1.0.0.tar.gz', sha256: 'c'.repeat(64) },
    database: { file: 'ja-qa-wp7-database-1.0.0.sql.gz', sha256: 'd'.repeat(64) }
  },
  ...over
})

/** Produce a setting from a template, lay the pack out the way a release folder is, and let TCH read it. */
async function chainOnce(ctx, tpl = template()) {
  const settingFromTemplate = await producerSetting(ctx)
  const m = manifest()
  const made = await observe(() => settingFromTemplate(Buffer.from(JSON.stringify(tpl)), m))
  if (made.threw || !made.value?.text) return { made, reading: null }
  const consumer = await load(ctx.repoRoot, 'apps/tracy-web/src/lib/local-releases.js')
  const reading = await withTempDir(path.join(ctx.outDir, 'tmp'), async (root) => {
    const dir = path.join(root, 'ja-qa', 'wp7')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, m.webroot.file), WEBROOT)
    await fs.writeFile(path.join(dir, m.database.file), DATABASE)
    await fs.writeFile(path.join(dir, 'tracy_setting.json'), made.value.text)
    const packs = await observe(() => consumer.readLocalPacks(root))
    const pack = packs.value?.[0] ?? null
    const parts = pack?.setting
      ? await Promise.all(Object.values(pack.setting.install).map((p) => consumer.localInstallPart(dir, p)))
      : []
    return { threw: packs.threw, setting: pack?.setting ?? null, reason: pack?.reason ?? null, parts }
  })
  return { made, reading }
}

const refuses = (made) =>
  made.threw === null &&
  Array.isArray(made.value?.problems) &&
  made.value.problems.length > 0 &&
  made.value.text === null
const accepted = (r) =>
  r.made.threw === null &&
  r.made.value?.problems?.length === 0 &&
  r.reading?.setting &&
  r.reading.reason === null &&
  r.reading.parts.every((p) => !p.pending && p.bytes > 0)
const wpControlRefusal = async (ctx) => {
  const r = await chainOnce(ctx, template({ template: 'ja-other' }))
  return ok(refuses(r.made), JSON.stringify({ threw: r.made.threw, problems: r.made.value?.problems }))
}
const wpControlAcceptance = async (ctx) => {
  const r = await chainOnce(ctx)
  return ok(
    accepted(r),
    JSON.stringify({ threw: r.made.threw, problems: r.made.value?.problems, reason: r.reading?.reason })
  )
}

const WP_VARIANTS = {
  'artifact-accepted-by-tch': { tags: ['happy', 'bad-hash'], mutation: 'stale-hash-kept' },
  'file-names-follow-the-manifest': { tags: ['happy', 'missing-asset'], mutation: 'stale-file-name-kept' },
  'cms-follows-the-manifest': { tags: ['upgrade-compat', 'happy'], mutation: 'cms-kept' },
  'other-port-refused': { tags: ['invalid', 'mixed-version'], mutation: 'accept-other-port' },
  'other-platform-refused': { tags: ['invalid', 'mixed-version'], mutation: 'accept-other-platform' },
  'incomplete-template-refused': { tags: ['invalid', 'empty'], mutation: 'accept-incomplete-template' }
}

async function wpCheck(ctx) {
  const key = ctx.params.variant
  if (key === 'artifact-accepted-by-tch' || key === 'file-names-follow-the-manifest') {
    const r = await chainOnce(ctx)
    const m = manifest()
    const named =
      r.reading?.setting &&
      r.reading.setting.install.webroot.file === m.webroot.file &&
      r.reading.setting.install.database.file === m.database.file
    return {
      control: await wpControlRefusal(ctx),
      check: ok(
        key === 'artifact-accepted-by-tch' ? accepted(r) : named && accepted(r),
        JSON.stringify({
          threw: r.made.threw,
          problems: r.made.value?.problems,
          reason: r.reading?.reason,
          parts: r.reading?.parts
        })
      )
    }
  }
  if (key === 'cms-follows-the-manifest') {
    const r = await chainOnce(ctx)
    const cms = r.reading?.setting?.cms
    return {
      control: await wpControlRefusal(ctx),
      check: ok(
        cms === manifest().wpVersion,
        JSON.stringify({ cms, want: manifest().wpVersion, threw: r.made.threw })
      )
    }
  }
  const bad = {
    'other-port-refused': template({ template: 'ja-other' }),
    'other-platform-refused': template({ platform: 'joomla' }),
    'incomplete-template-refused': template({ install: { webroot: template().install.webroot } })
  }[key]
  const r = await chainOnce(ctx, bad)
  return {
    control: await wpControlAcceptance(ctx),
    check: ok(
      refuses(r.made),
      JSON.stringify({
        threw: r.made.threw,
        problems: r.made.value?.problems,
        text: Boolean(r.made.value?.text)
      })
    )
  }
}

const corrupt = {
  pending: (c) => ({ ...c, pending: ['a page nobody mapped yet'] }),
  schema: (c) => ({ ...c, schemaVersion: 2 })
}

async function emdashModules(ctx, theme) {
  const producer = await load(ctx.root, EMDASH_PRODUCER)
  const tch = await load(ctx.repoRoot, `packages/cms/tracy-emdash-theme-${theme}/tools/qa-contract.mjs`)
  const artifact = JSON.parse(
    await readTextAsync(path.join(ctx.dataRoot, `packages/cms/tracy-emdash-theme-${theme}/qa.contract.json`))
  )
  return { producer, tch, artifact }
}

const EM_KINDS = {
  accepts: { tags: ['happy'], mutation: 'producer-rejects-everything' },
  'rejects-pending': { tags: ['invalid'], mutation: 'producer-ignores-pending' },
  'rejects-schema': { tags: ['invalid', 'mixed-version'], mutation: 'producer-ignores-schema' }
}

async function emdashCheck(ctx) {
  const { theme, kind } = ctx.params
  const { producer, tch, artifact } = await emdashModules(ctx, theme)
  const run = (mod, doc) => observe(() => mod.validateContract(doc))
  const accepts = async (doc) => {
    const [a, b] = [await run(producer, doc), await run(tch, doc)]
    return {
      ok: a.threw === null && b.threw === null && a.value.length === 0 && b.value.length === 0,
      producer: a.value ?? a.threw,
      tch: b.value ?? b.threw
    }
  }
  const rejects = async (doc) => {
    const [a, b] = [await run(producer, doc), await run(tch, doc)]
    return {
      ok: a.threw === null && b.threw === null && a.value.length > 0 && b.value.length > 0,
      producer: a.value ?? a.threw,
      tch: b.value ?? b.threw
    }
  }
  if (kind === 'accepts') {
    const c = await rejects(corrupt.pending(artifact))
    const r = await accepts(artifact)
    return { control: ok(c.ok, JSON.stringify(c)), check: ok(r.ok, JSON.stringify(r)) }
  }
  const c = await accepts(artifact)
  const r = await rejects(corrupt[kind === 'rejects-pending' ? 'pending' : 'schema'](artifact))
  return { control: ok(c.ok, JSON.stringify(c)), check: ok(r.ok, JSON.stringify(r)) }
}

export async function pinCheck(ctx) {
  const pin = PINS[ctx.params.pin]
  // Only a pin note that is really absent means "no pinned commit"; any refusal of the read stays an error.
  const note = await readTextAsync(path.join(ctx.dataRoot, pin.note)).catch((error) => {
    if (error instanceof BoundedReadError && error.code === 'MISSING') return ''
    throw error
  })
  const sha = pin.re.exec(note)?.[1] ?? null
  const where = resolveRoot(ctx.env)
  const clone = path.join(where.root ?? '', pin.repo)
  const head = await cloneHas(clone, 'HEAD')
  if (!sha)
    return {
      control: ok(head, 'HEAD of the clone resolves'),
      check: ok(false, `${pin.note} names no pinned commit`)
    }
  const present = await cloneHas(clone, sha)
  const ancestor = present && (await isAncestor(clone, sha))
  return {
    control: ok(head, 'HEAD of the clone resolves'),
    check: ok(present && ancestor, JSON.stringify({ pin: sha, inClone: present, ancestorOfHead: ancestor }))
  }
}

const pinMutation = (pin) => ({
  id: 'pin-names-nothing-real',
  kind: 'data',
  describe: 'the pinned commit in IMPORT-NOTE is replaced by one the producer never had',
  copy: [PINS[pin].note],
  files: [
    {
      path: PINS[pin].note,
      text: (t) => t.replace(PINS[pin].re, (whole, sha) => whole.replace(sha, 'deadbee'))
    }
  ]
})

export function chainSpecs() {
  const wpMutations = {
    'stale-hash-kept': mutation(
      'stale-hash-kept',
      "the template's old sha256 is kept",
      WP_RELEASE,
      'next.install[key].sha256 = manifest[key].sha256',
      'void 0'
    ),
    'stale-file-name-kept': mutation(
      'stale-file-name-kept',
      "the template's old file names are kept",
      WP_RELEASE,
      'next.install[key].file = manifest[key].file',
      'void 0'
    ),
    'cms-kept': mutation(
      'cms-kept',
      "cms is not moved to the manifest's WordPress version",
      WP_RELEASE,
      'next.cms = manifest.wpVersion',
      'next.cms = next.cms'
    ),
    'accept-other-port': mutation(
      'accept-other-port',
      'a template of another port is accepted',
      WP_RELEASE,
      "if (typeof t.template !== 'string' || t.template !== slug) problems.push(",
      'if (false) problems.push('
    ),
    'accept-other-platform': mutation(
      'accept-other-platform',
      'a template of another platform is accepted',
      WP_RELEASE,
      'if (t.platform !== manifest.platform) problems.push(',
      'if (false) problems.push('
    ),
    'accept-incomplete-template': mutation(
      'accept-incomplete-template',
      'a template without install parts is accepted',
      WP_RELEASE,
      'if (!obj(t.install) || !obj(t.install.webroot) || !obj(t.install.database)) problems.push(',
      'if (false) problems.push('
    )
  }
  const emMutations = {
    'producer-rejects-everything': mutation(
      'producer-rejects-everything',
      'the validator rejects every contract',
      EMDASH_PRODUCER,
      "check(c?.schemaVersion === 1, 'schemaVersion must be 1')",
      "check(false, 'schemaVersion must be 1')"
    ),
    'producer-ignores-pending': mutation(
      'producer-ignores-pending',
      'pending decisions no longer block validation',
      EMDASH_PRODUCER,
      "check(Array.isArray(c.pending) && c.pending.length === 0, 'pending decisions must be resolved')",
      "check(true, 'pending decisions must be resolved')"
    ),
    'producer-ignores-schema': mutation(
      'producer-ignores-schema',
      'another schema version is accepted',
      EMDASH_PRODUCER,
      "check(c?.schemaVersion === 1, 'schemaVersion must be 1')",
      "check(true, 'schemaVersion must be 1')"
    )
  }
  return [
    {
      item: null,
      assertion: 'chain.wp-setting-from-template',
      area: 'chain',
      requirement:
        'The WordPress release tool writes a tracy_setting.json that TCH reads and validates for the pack it describes (names, sha256, CMS version), and refuses templates of another port, platform or shape.',
      oracle: {
        source: `${ADR17} + vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/scripts/quickstart/release.mjs (settingFromTemplate doc comment)`,
        section: "§2-§3: the setting names the release's own files and pins their sha256",
        invariant:
          'version, file names and sha256 come from the manifest; cms from the WordPress version; a template of another port is refused'
      },
      reads: [
        'vendor/wordpress/tracy-wordpress-theme (pinned producer)',
        'apps/tracy-web/src/lib/local-releases.js'
      ],
      variants: Object.entries(WP_VARIANTS).map(([variant, v]) => ({
        key: variant,
        itemId: 'chain:wp-setting-from-template',
        tags: v.tags,
        params: { variant },
        mutation: v.mutation
      })),
      mutations: wpMutations,
      execute: wpCheck
    },
    {
      item: null,
      assertion: 'chain.emdash-qa-contract',
      area: 'chain',
      requirement:
        "The EmDash kit's qa-contract validator and TCH's copy both accept each theme's committed qa.contract.json and both reject a skeleton with pending decisions or another schema version.",
      oracle: {
        source:
          'vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/tools/qa-contract.mjs (header: "pages, rules and interactions stay unauthored (and pending non-empty) so the skeleton cannot validate")',
        section: 'validateContract',
        invariant: 'schemaVersion is 1 and pending is empty for a contract that validates'
      },
      reads: [
        'vendor/emdash/tracy-emdash-skill (pinned producer)',
        'packages/cms/tracy-emdash-theme-*/{qa.contract.json,tools/qa-contract.mjs}'
      ],
      variants: THEMES.flatMap((theme) =>
        Object.entries(EM_KINDS).map(([kind, v]) => ({
          key: `${kind}-${theme}`,
          itemId: 'chain:emdash-qa-contract',
          tags: v.tags,
          params: { theme, kind },
          mutation: v.mutation
        }))
      ),
      mutations: emMutations,
      execute: emdashCheck
    },
    {
      item: null,
      assertion: 'chain.vendor-pin-exists-in-producer',
      area: 'chain',
      requirement:
        "The commit TCH's IMPORT-NOTE pins for a vendored skill exists in the producer clone and is an ancestor of its HEAD.",
      oracle: {
        source: `CLAUDE.md §1 (vendor: every other folder = subtree pinned to one commit) + ${ADR6}`,
        section: 'subtree pinned to a commit',
        invariant: 'the pin names a real commit of the producer on its current history'
      },
      reads: ['${QA_RELATED_ROOT}/<producer clone> (read-only)', 'vendor/*/IMPORT-NOTE.md'],
      variants: Object.keys(PINS).map((pin) => ({
        key: pin,
        itemId: `chain:vendor-pin:${pin}`,
        tags: ['happy', 'mixed-version'],
        params: { pin },
        mutation: 'pin-names-nothing-real',
        prerequisites: ['config:related-root', `clone:${PINS[pin].repo}`, `pin-in-clone:${pin}`]
      })),
      mutations: { 'pin-names-nothing-real': (p) => pinMutation(p.pin) },
      execute: pinCheck
    },
    ...[
      [
        'chain.joomla-producer-artifact',
        'chain:joomla-producer-artifact',
        'no producer function of the pinned Joomla skill writes an artifact TCH consumes (tracy_setting.json, contract manifest) that can be called without a Joomla site; the producer-to-consumer chain for Joomla is not built'
      ],
      [
        'chain.docs-adr-evidence-hash',
        'chain:docs-adr-evidence-hash',
        'tracy-docs ADR/API documentation and evidence hashes are not yet tied to the TCH ADRs by an independent check; no ruling says which document owns which hash'
      ],
      [
        'chain.workers-history',
        'chain:workers-history',
        'the Workers/Cloudflare documents of tracy-infra describe a retired architecture (CLAUDE.md: history) and are not mapped to the current system, so they are not an oracle'
      ]
    ].map(([assertion, itemId, why]) => ({
      item: null,
      assertion,
      area: 'chain',
      requirement: `Open obligation: ${itemId}.`,
      oracle: {
        source: 'plan §4 related (producer -> artifact -> TCH consumer; Workers documents are history)',
        section: itemId,
        invariant: 'stays PENDING until a producer, an artifact and an independent oracle exist'
      },
      reads: [],
      variants: [{ key: itemId.replace('chain:', ''), itemId, tags: ['happy'], params: {}, mutation: null }],
      mutations: {},
      pending: why
    }))
  ]
}

export const CHAIN_ITEMS = [
  {
    id: 'chain:wp-setting-from-template',
    kind: 'handoff-contract',
    requiredTags: [
      'happy',
      'invalid',
      'empty',
      'bad-hash',
      'missing-asset',
      'upgrade-compat',
      'mixed-version'
    ]
  },
  {
    id: 'chain:emdash-qa-contract',
    kind: 'handoff-contract',
    requiredTags: ['happy', 'invalid', 'mixed-version']
  },
  ...Object.keys(PINS).map((pin) => ({
    id: `chain:vendor-pin:${pin}`,
    kind: 'handoff-contract',
    requiredTags: ['happy', 'mixed-version']
  })),
  { id: 'chain:joomla-producer-artifact', kind: 'handoff-contract', requiredTags: ['happy'] },
  { id: 'chain:docs-adr-evidence-hash', kind: 'handoff-contract', requiredTags: ['happy'] },
  { id: 'chain:workers-history', kind: 'handoff-contract', requiredTags: ['happy'] }
]
