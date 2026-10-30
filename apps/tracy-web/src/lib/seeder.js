/**
 * The content seeder's own modules (`packages/cms/tracy-seeder`), loaded where this process runs.
 *
 * "Apply" writes a site's words with the SAME planners and the SAME door calls the seeder uses
 * (`plan-wordpress-contract`, `plan-joomla-contract`, `apply-joomla-contract`,
 * `wordpress-contract-door`, and the rest of `SEEDER_MODULES`): they hold the rules that keep a model out of
 * a sealed site — which slots may be written, how a value is judged, what the Claude Cowork plugin
 * refuses — and a second copy of them would be a second set of rules to keep right. They are pure
 * modules that take their model and their door as arguments, which is what lets a process that is
 * not dsh run them.
 *
 * 🔒 THIS PROCESS CANNOT IMPORT `packages/` IN THE IMAGE (`Dockerfile`: the image carries
 * `apps/tracy-web` alone), so the leaf modules are COPYed to `src/seeder/` there, exactly as the
 * contract profiles are copied to `src/contracts/`; a checkout reads the package in place. Only the
 * leaf modules are copied: `cli.mjs`, `inputs.mjs` and `writers.mjs` import other packages, and nothing
 * here loads them.
 */
import { existsSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const IN_IMAGE = fileURLToPath(new URL('../seeder/', import.meta.url))
const IN_CHECKOUT = fileURLToPath(new URL('../../../../packages/cms/tracy-seeder/src/', import.meta.url))

/** Where the seeder's modules are: the image's copy, else the checkout's package. */
export const SEEDER_DIR = existsSync(IN_IMAGE) ? IN_IMAGE : IN_CHECKOUT

/**
 * Every seeder module this process loads, by file name without `.mjs`.
 *
 * 🔒 THE LIST IS THE IMAGE'S CONTRACT. In the image these files sit in `src/seeder/` with no
 * sibling package beside them, so a module that imports anything outside its own directory loads
 * in a checkout and fails in the image (#1019: `wordpress-contract-door` reached
 * `../../tracy-wordpress-quickstart/language-packs.json` and every WordPress brief on dev failed).
 * `scripts/test/tracy-web-seeder-image.test.mjs` copies the seeder's `src/` alone, the way the
 * Dockerfile does, and imports every name here; `seeder()` refuses a name that is not here, so a
 * new caller cannot skip that test.
 */
export const SEEDER_MODULES = Object.freeze([
  'apply-joomla-contract',
  'apply-joomla-demo-trim',
  'apply-joomla-language',
  'apply-wordpress-contract',
  'chrome-slots',
  'distinct-copy',
  'fact-sources',
  'locales',
  'model',
  'nav-labels',
  'page-author',
  'plan-joomla-contract',
  'plan-joomla-language',
  'plan-wordpress-contract',
  'shipped-translations',
  'site-ops',
  'template-buttons',
  'tone',
  'wordpress-contract-door'
])

/** @type {Map<string, Promise<any>>} */
const loaded = new Map()

/**
 * One of the seeder's modules.
 * @param {string} name - the file's name without `.mjs`, e.g. `plan-wordpress-contract`
 * @returns {Promise<any>}
 */
export function seeder(name) {
  if (!SEEDER_MODULES.includes(name)) throw new Error(`not a seeder module: ${name}`)
  let module = loaded.get(name)
  if (module === undefined) {
    module = import(pathToFileURL(path.join(SEEDER_DIR, `${name}.mjs`)).href)
    loaded.set(name, module)
  }
  return module
}

/** @type {Map<string, string>} */
const farms = new Map()

/**
 * The directory layout the seeder reads contracts from — `<dataDir>/quickstart-contracts/<id>/…` — for
 * one contract, made of links to the profile this process already holds.
 *
 * The planners ask for a `dataDir` and the contract's id and open `multilingual-map.json`,
 * `demo-trim-map.json` and the like beside it. This process keeps its profiles where the image put
 * them (a merged tree) or, in a checkout, in two package trees; a link per contract gives the
 * seeder the layout it expects without copying a megabyte of JSON per site.
 * @param {{ id: string, dir: string }} contract
 * @returns {string} the `dataDir`
 */
export function seederDataDir(contract) {
  let root = farms.get('root')
  if (root === undefined) {
    root = mkdtempSync(path.join(tmpdir(), 'tracy-seeder-data-'))
    farms.set('root', root)
  }
  link(path.join(root, 'quickstart-contracts', contract.id), contract.dir)
  const shipped = translationsDirOf(contract)
  if (shipped) link(path.join(root, 'quickstart-translations', contract.id), shipped)
  return root
}

/**
 * What a quickstart ships translated for its own demo copy: one `<locale>.json` per language, in a tree beside the
 * contracts with the same release/version folders (`contracts/tracy-business/j6/1.2.0` ↔ `translations/tracy-business/j6/1.2.0`).
 * @param {{ dir: string }} contract
 * @returns {string | null} the folder, or null when the release ships none
 */
export function translationsDirOf(contract) {
  const shipped = contract.dir
    .split(`${path.sep}contracts${path.sep}`)
    .join(`${path.sep}translations${path.sep}`)
  return shipped !== contract.dir && existsSync(shipped) ? shipped : null
}

/** Make `target` a link to `source`, once: a second press of one release in the same instant finds it made. */
function link(target, source) {
  if (existsSync(target)) return
  mkdirSync(path.dirname(target), { recursive: true })
  try {
    symlinkSync(source, target, 'dir')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code !== 'EEXIST') throw error
  }
}
