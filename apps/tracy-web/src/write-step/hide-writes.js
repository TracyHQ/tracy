// The hide stage's door calls (ADR 0044, decisions 2 and 4), each answering in the plugin's own words: whether the plugin takes
// hide orders at all, the menu items of dropped pages, the source language overrides and `blocks.unpublish`. A write carries
// the apply id the door requires, and a refusal never stops the others.
import { createHash } from 'node:crypto'
import { BUSY_WAITS_MS, refusalWords } from './contract-write.js'
import { menuRows } from '../lib/joomla-menu-rows.js'
import { rowsOpening } from './page-meta-write.js'
import { answerWords, doorCall, readRow } from './settings-door.js'

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** How a thing taken off the site is read back: its row, unpublished. */
export const unpublishedRead = (kind, id) => ({ ordered: '0', readFrom: readRow(kind, id, 'published') })

/** Why this site's plugin takes no hide order, or null when it does; `rowsRemove`: whether it has the `rows.remove` door. */
export async function hideOpsOf(door, siteKey) {
  const older =
    'the plugin on this site is older than the hide orders (info.hide_ops), which it would ignore, so nothing was hidden'
  try {
    const answer = await door.apply({ siteKey, action: 'info', params: {} })
    if (answer?.ok === false)
      return {
        problem: `the plugin could not say whether it takes hide orders: ${answerWords(answer)}`,
        rowsRemove: false
      }
    const ops = answer?.info?.hide_ops
    return { problem: Number(ops?.version) >= 1 ? null : older, rowsRemove: Number(ops?.rows_remove) >= 1 }
  } catch (error) {
    return {
      problem: `the plugin could not say whether it takes hide orders: ${String(error?.message ?? error)}`,
      rowsRemove: false
    }
  }
}

/** A door call that waits out a busy site, as the contract write does: a lock miss proves nothing ran. */
async function asked(door, call, sleep) {
  for (const wait of [...BUSY_WAITS_MS, null]) {
    const answer = await door.apply(call)
    if (answer?.error !== 'writer_busy' || wait === null) return answer
    await sleep(wait)
  }
}

/** Unpublishes the items of dropped pages the main menu does not take away. By page id: { status, reason, ... }. */
export async function dropPages({ door, siteKey, pages, results }) {
  if (!pages.length) return false
  const call = doorCall(door, siteKey)
  const applyId = `hide-pages-${digest(pages.map((p) => p.page.id)).slice(0, 32)}`
  let rows
  try {
    rows = await menuRows(call)
  } catch (error) {
    for (const { page } of pages)
      results.set(page.id, { status: 'failed', reason: `the menu could not be read: ${error.message}` })
    return false
  }
  let wrote = false
  for (const { page, depends } of pages) {
    if (depends) {
      results.set(page.id, {
        status: 'failed',
        reason: `the plan drops this page, but ${depends} needs its path: an unpublished item takes it with it, so it stays published`
      })
      continue
    }
    const opening = rowsOpening(page, rows)
    if (!opening.length) {
      results.set(page.id, { status: 'skipped', reason: 'no published menu item opens this dropped page' })
      continue
    }
    try {
      for (const row of opening) {
        await call('content.update', {
          apply_id: applyId,
          kind: 'menuItem',
          id: Number(row.id),
          fields: { published: 0 }
        })
        wrote = true
      }
      results.set(page.id, {
        status: 'hidden',
        reason: 'the plan drops this page: its menu item is unpublished',
        ...unpublishedRead('menuItem', Number(opening[0].id))
      })
    } catch (error) {
      results.set(page.id, { status: 'failed', reason: error.message })
    }
  }
  return wrote
}

/** Sends the kit's constants; each one the plugin leaves out is named in `refused`. */
export async function emptyConstants({ door, siteKey, strings, template, sleep }) {
  const applyId = `hide-words-${digest(strings).slice(0, 32)}`
  const answer = await asked(
    door,
    {
      siteKey,
      action: 'template.languageOverrides',
      params: { operation: 'setSource', apply_id: applyId, template, strings }
    },
    sleep
  )
  if (answer?.ok === false) return { refusedAll: answerWords(answer), refused: new Map() }
  const refused = new Map(
    (Array.isArray(answer?.refused) ? answer.refused : []).map((r) => [r?.key, r?.reason])
  )
  return { refusedAll: null, refused }
}

/** `blocks.unpublish`, dropping what the plugin names. By module key: true, or the words that refused it. */
export async function unpublishBlocks({ door, siteKey, modules, revision, contract, sleep }) {
  const done = new Map()
  let left = [...modules]
  while (left.length) {
    const hash = digest({ siteKey, contract, revision, blocks: left })
    const answer = await asked(
      door,
      {
        siteKey,
        action: 'content.contract',
        params: {
          operation: 'blocks.unpublish',
          apply_id: `contract-${hash.slice(0, 48)}`,
          request_id: hash,
          expected_revision: revision,
          blocks: left
        }
      },
      sleep
    )
    if (answer?.ok !== false) {
      for (const key of left) done.set(key, true)
      return { done, wrote: true }
    }
    const named = (Array.isArray(answer.errors) ? answer.errors : []).filter((e) =>
      left.includes(e?.field?.slotKey)
    )
    if (!named.length) {
      for (const key of left) done.set(key, answerWords(answer))
      return { done, wrote: false }
    }
    for (const entry of named) done.set(entry.field.slotKey, refusalWords(entry))
    left = left.filter((key) => !done.has(key))
  }
  return { done, wrote: false }
}

/**
 * `rows.remove`, dropping what the plugin names: it answers all or nothing, so a retry goes without exactly those. By slot key:
 * true, or the words that refused it. A slot the plugin takes along unnamed is not listed: it had no owner.
 */
export async function removeRows({ door, siteKey, slots, keep, revision, contract, sleep }) {
  const done = new Map()
  let left = [...slots]
  while (left.length) {
    const hash = digest({ siteKey, contract, revision, slots: left, keep })
    const answer = await asked(
      door,
      {
        siteKey,
        action: 'content.contract',
        params: {
          operation: 'rows.remove',
          apply_id: `contract-${hash.slice(0, 48)}`,
          request_id: hash,
          expected_revision: revision,
          slots: left,
          keep
        }
      },
      sleep
    )
    if (answer?.ok !== false) {
      for (const key of left) done.set(key, true)
      return { done, wrote: answer?.unchanged !== true }
    }
    const named = (Array.isArray(answer.errors) ? answer.errors : []).filter((e) =>
      left.includes(e?.field?.slotKey)
    )
    if (!named.length) {
      for (const key of left) done.set(key, answerWords(answer))
      return { done, wrote: false }
    }
    for (const entry of named) done.set(entry.field.slotKey, refusalWords(entry))
    left = left.filter((key) => !done.has(key))
  }
  return { done, wrote: false }
}
