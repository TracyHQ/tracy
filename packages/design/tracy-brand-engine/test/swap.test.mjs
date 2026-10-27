/**
 * The deep pass swaps its measurement over the quick card that the page is already showing. The
 * bar is not "the new files arrive" — it is that the card is READABLE THROUGHOUT: `phase` still
 * says `quick` while the swap runs, so a poller is being told to read the folder at that exact
 * moment.
 *
 * This is the seam the route test could not hold. There, the window was a race: microseconds on an
 * idle laptop, wide enough to lose on the shared CI runner, where `tokens.css present during the
 * deep pass` went red for months with no hint of the cause. Here a watcher runs between every
 * await of the swap, so the two-directory-rename version fails EVERY run, on any machine.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

import { swapOver } from '../lib/index.js'

const roots = []
function dirs() {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-brand-swap-'))
  roots.push(root)
  const from = path.join(root, 'from')
  const to = path.join(root, 'to')
  mkdirSync(path.join(from, 'pages'), { recursive: true })
  mkdirSync(path.join(to, 'recon'), { recursive: true })
  writeFileSync(path.join(from, 'tokens.css'), ':root{--deep:1}')
  writeFileSync(path.join(from, 'manifest.json'), '{"deep":true}')
  writeFileSync(path.join(from, 'pages', 'pages.json'), '[]')
  writeFileSync(path.join(to, 'tokens.css'), ':root{--quick:1}')
  writeFileSync(path.join(to, 'manifest.json'), '{"deep":false}')
  writeFileSync(path.join(to, 'recon', 'note.txt'), 'from the quick pass')
  return { from, to }
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

test('swapOver: the card stays readable through the swap — tokens.css is never absent', async () => {
  const { from, to } = dirs()
  const card = path.join(to, 'tokens.css')
  let missed = 0
  let watching = true
  const watch = () => {
    if (!watching) return
    if (!existsSync(card)) missed += 1
    setImmediate(watch)
  }
  setImmediate(watch)
  await swapOver(from, to)
  watching = false
  assert.equal(missed, 0, 'tokens.css disappeared while the swap was running')
  assert.equal(readFileSync(card, 'utf8'), ':root{--deep:1}', 'and it is the deep one afterwards')
})

test('swapOver: what the new measurement did not bring is gone, and the side folder with it', async () => {
  const { from, to } = dirs()
  await swapOver(from, to)
  assert.equal(readFileSync(path.join(to, 'manifest.json'), 'utf8'), '{"deep":true}')
  assert.ok(existsSync(path.join(to, 'pages', 'pages.json')), 'the crawl came over')
  assert.equal(existsSync(path.join(to, 'recon')), false, 'the quick pass left nothing behind')
  assert.equal(existsSync(from), false, 'the side folder is gone')
})
