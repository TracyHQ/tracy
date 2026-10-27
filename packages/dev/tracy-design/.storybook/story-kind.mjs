/**
 * Classify every story by the question a UI reviewer actually asks:
 * "Does this screen exist, and if I improve it, do customers get the change?"
 *
 * The label is NOT declared by hand. It is derived from the IMPORT GRAPH, followed all the way
 * down, because the truth usually sits one level below the story file: `Screens.stories.tsx`
 * imports `./home/Home.tsx`, and only opening that file shows it is built from `@tracy/ui` and
 * bench fixtures rather than from product code.
 *
 * Both `main.ts` (which tags the index) and `scripts/check-story-tags.mjs` (the gate) call this
 * one module, so the rule lives in a single place and cannot drift between them.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Repo root, derived from this file: `.storybook` -> `tracy-design` -> `dev` -> `packages` -> root.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

/** Three labels, named after what the reviewer does with them, not after a technical layer. */
export const REAL = 'real-screen'
export const DRAFT = 'not-in-product'
export const KIT = 'building-block'

/**
 * PRODUCT code: editing here reaches customers.
 *
 * `workers/` returns HTML straight to a customer's browser. The dsh plugin packages travel
 * through the registry into the image and onto a lane. Both are roads to a customer.
 */
const PRODUCT_DIRS = [
  'workers/',
  // tracy-web's own pages (login, join, team…) return HTML straight to the browser on
  // cowork.tracy.site — the new architecture's road to a customer.
  'apps/tracy-web/',
  'packages/site/',
  'packages/web/',
  'packages/ui/tracy-chat-input/',
  'packages/ui/tracy-settings/',
  'packages/ui/tracy-sidebar/',
  // The design-inspirations plugin: a story reaching its client half shows a real product screen.
  'packages/design/tracy-design-inspiration/',
  // The brand engine's two tabs: same road to a lane.
  'packages/design/tracy-brand-engine/'
]

/**
 * BUILDING BLOCKS: real code, but not a screen.
 *
 * `tracy-ui` is the shared component set and `tracy-brand` is the logo. Rebuilding a screen out
 * of them does not make that screen exist — which is exactly the trap `Screens/App` fell into.
 */
const KIT_DIRS = ['packages/ui/tracy-ui/', 'packages/brand/']

const EXTS = ['.tsx', '.ts', '.jsx', '.js', '.mjs']
const RESOLVE_AS = [...EXTS, ...EXTS.map((e) => `/index${e}`)]

/** Map `@tracy/<pkg>` to a real directory, read from each package's own `package.json`. */
function packageMap() {
  const map = new Map()
  for (const group of readdirSync(join(ROOT, 'packages'))) {
    const groupDir = join(ROOT, 'packages', group)
    if (!statSync(groupDir).isDirectory()) continue
    for (const pkg of readdirSync(groupDir)) {
      const manifest = join(groupDir, pkg, 'package.json')
      if (!existsSync(manifest)) continue
      try {
        const { name } = JSON.parse(readFileSync(manifest, 'utf8'))
        if (name) map.set(name, join(groupDir, pkg))
      } catch {
        // A package whose manifest will not parse cannot resolve at runtime either — skip it.
      }
    }
  }
  return map
}

const PACKAGES = packageMap()

function resolveSpec(spec, fromFile) {
  if (spec.startsWith('.')) {
    const base = resolve(dirname(fromFile), spec)
    // TypeScript NodeNext writes './x.js' for a './x.ts' source.
    const stripped = base.replace(/\.js$/, '')
    for (const cand of [base, stripped]) {
      for (const ext of ['', ...RESOLVE_AS]) {
        if (existsSync(cand + ext) && statSync(cand + ext).isFile()) return cand + ext
      }
    }
    return null
  }
  for (const [name, dir] of PACKAGES) {
    if (spec === name || spec.startsWith(`${name}/`)) {
      const sub = spec.slice(name.length).replace(/^\//, '')
      const candidates = sub
        ? [join(dir, 'src', sub), join(dir, sub), join(dir, 'src', 'client', sub)]
        : [join(dir, 'src', 'index'), join(dir, 'src', 'client', 'index')]
      for (const cand of candidates) {
        for (const ext of ['', ...RESOLVE_AS]) {
          if (existsSync(cand + ext) && statSync(cand + ext).isFile()) return cand + ext
        }
      }
      // The package resolved but the entry file did not: still count the package as REACHED.
      return join(dir, 'src', '__unresolved__')
    }
  }
  return null
}

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

/** Walk the whole graph; return every file reached, relative to the repo root. */
export function reachableFrom(entry) {
  const seen = new Set()
  const queue = [resolve(entry)]
  while (queue.length) {
    const file = queue.shift()
    const rel = relative(ROOT, file)
    if (seen.has(rel)) continue
    seen.add(rel)
    if (!existsSync(file) || !statSync(file).isFile()) continue
    let src
    try {
      src = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const m of src.matchAll(IMPORT_RE)) {
      const next = resolveSpec(m[1], file)
      if (next) queue.push(next)
    }
  }
  return seen
}

function isUnder(rel, dirs) {
  const p = rel.split('\\').join('/')
  return dirs.some((d) => p.startsWith(d))
}

/**
 * The decision, in order — the first rule that matches wins.
 *
 * 1. A story living NEXT TO a shared component documents a block, not a screen.
 * 2. A modest self-declaration outranks the graph (see below).
 * 3. The graph reaches product code: a real screen, and edits reach customers.
 * 4. Otherwise: a draft, built from blocks and fixtures, absent from the product.
 */
export function classify(storyFile) {
  const rel = relative(ROOT, resolve(storyFile))
  if (isUnder(rel, KIT_DIRS)) return { kind: KIT, evidence: rel }

  // A MODEST CLAIM OUTRANKS THE MACHINE.
  //
  // `.mock.stories.tsx` is the author saying "this one does not exist yet". Nobody talks
  // themselves down in order to cheat, so that claim is trustworthy and beats the graph. The
  // opposite direction is what needs checking: claiming "this is a real screen" must be proven
  // by imports.
  //
  // It rescues one real case: `mode-picker.mock.stories.tsx` borrows `platforms` and `roles`
  // from `@tracy/harness-web` so the drawing carries true numbers, while the screen itself is
  // still only a proposal.
  if (/\.mock\.stories\.(ts|tsx)$/.test(rel)) {
    return { kind: DRAFT, evidence: 'self-declared .mock.stories' }
  }

  const productHit = [...reachableFrom(storyFile)].find((f) => isUnder(f, PRODUCT_DIRS))
  if (productHit) return { kind: REAL, evidence: productHit }
  return { kind: DRAFT, evidence: 'reaches only building blocks and bench files' }
}

/** Every `*.stories.ts(x)` under a root, ignoring build output. */
export function findStories(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'storybook-static', '.git'].includes(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...findStories(p))
    else if (/\.stories\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}
