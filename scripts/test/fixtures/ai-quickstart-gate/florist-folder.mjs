// The invented florist kit written as a kit folder (`<slug>/<cms>/<version>`, ticket #586, review round 3): the files
// the gate reads from a folder (`gate-inputs.mjs` `kitOf`), so a check that rebuilds the marker plan from the folder
// runs on the same kit the florist gate measured. `change(kit)` alters the kit before it is written, to make another
// kit of the same name.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { floristKit } from './florist-kit.mjs'

export const FLORIST_ICONS = {
  set: 'invented-icons@1',
  icons: [{ name: 'leaf', tags: ['plant'], categories: [] }]
}

/** Write the florist kit into `<root>/example-petal/j6/1.0.0`; answers the folder. */
export function writeFloristFolder(root, change = (k) => k) {
  const kit = change(floristKit())
  const folder = path.join(root, kit.template.slug, 'j6', kit.template.version)
  mkdirSync(path.join(folder, 'blank-site-contract'), { recursive: true })
  mkdirSync(path.join(folder, 'check-record'), { recursive: true })
  const put = (file, value) => writeFileSync(path.join(folder, file), JSON.stringify(value, null, 1) + '\n')
  put('mapping.json', { ...kit.mapping, template: { ...kit.template, cms: 'j6' } })
  put('block-store.json', kit.blockStore)
  put('page-recipes.json', kit.pageRecipes)
  put('blank-site-contract/content-map.json', kit.blankContract)
  put('blank-site-contract/presentation-lock.json', kit.lock)
  return folder
}
