#!/usr/bin/env node
// Drops menu items from site-model.json that Joomla keeps in the TRASH (menu.published = -2).
// from-joomla.mjs (WordPress skill 1.3.0) exports them into the model with an empty path, and the
// EmDash seed validator then refuses the menu ("url is required for custom menu items").
// The public site never shows them: the running source's navigation has no such entry.
//   node ingest/prune-trashed-menu.mjs <j6/inventory.json> <seed/site-model.json>
// Matches on label AND an empty path, so a published item that shares a label is never touched.
import { readFileSync, writeFileSync } from 'node:fs'

const [invFile, modelFile] = process.argv.slice(2)
if (!invFile || !modelFile) {
  console.error('usage: prune-trashed-menu.mjs <inventory.json> <site-model.json>')
  process.exit(2)
}
const inv = JSON.parse(readFileSync(invFile, 'utf8'))
const model = JSON.parse(readFileSync(modelFile, 'utf8'))
const trashed = new Set(inv.menu.filter((m) => String(m.published) === '-2').map((m) => m.title))
let removed = 0
const labelOf = (it) => (typeof it.label === 'string' ? it.label : Object.values(it.label ?? {})[0])
const prune = (items) =>
  items
    .map((it) => (it.children ? { ...it, children: prune(it.children) } : it))
    .filter((it) => {
      const dead = !it.path && trashed.has(labelOf(it)) && !(it.children && it.children.length > 0)
      // a heading whose children were all trashed is itself dead (Vik Restaurant)
      const emptyHeading = it.kind === 'heading' && Array.isArray(it.children) && it.children.length === 0
      if (dead || emptyHeading) removed++
      return !(dead || emptyHeading)
    })
for (const menu of model.menus ?? []) menu.items = prune(menu.items ?? [])
writeFileSync(modelFile, JSON.stringify(model, null, 2) + '\n')
console.log(`prune-trashed-menu: removed ${removed} menu item(s)`)
