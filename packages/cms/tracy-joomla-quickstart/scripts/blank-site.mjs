/**
 * The blank site of an AI quickstart, made from the demo data of a Joomla human quickstart (ADR 0045, ticket #582).
 *
 * A blank site is the template with its design intact, no pages, empty menus, and every demo block (module) kept in
 * the block store: its row unchanged, assigned to no page. The build adds pages and places copies of blocks; it never
 * replaces demo content. The source site's accounts, sessions and secrets are not carried over.
 *
 * Pure: `produceBlankSite(sql)` takes the installer's `custom.sql` text and returns the blank site's text and a
 * report. Same input, same bytes out; running it on its own output changes nothing. Template files never pass through
 * here (the installer archive keeps them as they are, `zip-replace-entry.mjs`).
 *
 * The work is a list of steps (`BLANK_SITE_STEPS`), each `{id, run(ctx)}` over the parsed dump. A later step (for
 * example emptying the content fields a mapping file declares, ticket #584) is added to the list, not written into
 * these ones.
 */

import { blankSecrets, findSecrets } from './blank-site-secrets.mjs'
import { parseDump, records, removeRows, serializeDump } from './joomla-sql-dump.mjs'

/** Tables whose every row is demo content of a page: articles, contacts, tags on them, search index, history. */
const PAGE_TABLES = (
  'content content_frontpage content_rating contentitem_tag_map contact_details newsfeeds banners banner_clients ' +
  'banner_tracks ucm_content ucm_base ucm_history history associations finder_links finder_links_terms finder_terms ' +
  'finder_logging redirect_links'
).split(' ')

/** Tables that hold the source site's people: accounts, their keys and profiles, sessions, subscribers, logs. */
const ACCOUNT_TABLES = (
  'users user_usergroup_map user_profiles user_keys user_mfa user_notes webauthn_credentials session messages ' +
  'messages_cfg action_logs action_logs_users privacy_requests privacy_consents acym_user acym_user_has_list ' +
  'acym_user_has_field acym_user_stat acym_queue'
).split(' ')

const isSiteMenuItem = (r) => r.client_id === '0' && r.id !== '1'
const isKeptCategory = (r) => r.extension === 'system' || r.alias === 'uncategorised'
const isSiteBlock = (r) => r.client_id === '0'

export const BLANK_SITE_STEPS = [
  {
    id: 'remove-pages',
    run(ctx) {
      const out = { siteMenuItems: remove(ctx, 'menu', isSiteMenuItem).length }
      const assets = new Set()
      const assetNames = new Set()
      for (const r of remove(ctx, 'content', () => true)) assetNames.add(`com_content.article.${r.id}`)
      for (const r of remove(ctx, 'contact_details', () => true))
        assetNames.add(`com_contact.contact.${r.id}`)
      for (const r of remove(ctx, 'categories', (c) => !isKeptCategory(c)))
        assetNames.add(`${r.extension}.category.${r.id}`)
      for (const table of ['content', 'contact_details', 'categories']) {
        for (const r of ctx.removed.get(table) ?? [])
          if (r.asset_id && r.asset_id !== '0') assets.add(r.asset_id)
      }
      out.tags = remove(ctx, 'tags', (r) => r.id !== '1').length
      out.workflowAssociations = remove(
        ctx,
        'workflow_associations',
        (r) => r.extension === 'com_content.article'
      ).length
      for (const table of PAGE_TABLES) remove(ctx, table, () => true)
      out.assets = remove(ctx, 'assets', (r) => assets.has(r.id) || assetNames.has(r.name)).length
      return out
    }
  },
  {
    id: 'unassign-blocks',
    run(ctx) {
      const site = new Set(
        records(ctx.dump, 'modules')
          .filter(isSiteBlock)
          .map((r) => r.id)
      )
      return { assignments: remove(ctx, 'modules_menu', (r) => site.has(r.moduleid)).length }
    }
  },
  {
    id: 'remove-accounts',
    run(ctx) {
      return Object.fromEntries(
        ACCOUNT_TABLES.map((t) => [t, remove(ctx, t, () => true).length]).filter(([, n]) => n)
      )
    }
  },
  {
    id: 'blank-secrets',
    run(ctx) {
      ctx.secrets = blankSecrets(ctx.dump)
      return { blanked: ctx.secrets.length }
    }
  },
  {
    id: 'drop-updates-of-removed-rows',
    run(ctx) {
      const before = ctx.dump.parts.length
      ctx.dump.parts = ctx.dump.parts.filter((p) => {
        if (p.kind !== 'update') return true
        const gone = ctx.removed.get(p.table)
        if (!gone?.length) return true
        if (p.id !== null) return !gone.some((r) => r.id === p.id)
        return records(ctx.dump, p.table).length > 0
      })
      return { dropped: before - ctx.dump.parts.length }
    }
  }
]

/**
 * @param {string} sql  the human quickstart's `custom.sql`
 * @param {{ steps?: { id: string, run: (ctx: object) => object }[] }} [options]
 * @returns {{ sql: string, report: object }}
 */
export function produceBlankSite(sql, { steps = BLANK_SITE_STEPS } = {}) {
  const dump = parseDump(sql)
  const ctx = { dump, removed: new Map(), secrets: [] }
  const before = countSite(dump)
  const results = {}
  for (const step of steps) results[step.id] = step.run(ctx)
  const blockStore = records(dump, 'modules')
    .filter(isSiteBlock)
    .map(({ id, module, position, published, title }) => ({
      id,
      module,
      position,
      published,
      title: title.trim()
    }))
  return {
    sql: serializeDump(dump),
    report: { before, after: countSite(dump), blockStore, secrets: ctx.secrets, steps: results }
  }
}

/** Everything that keeps `sql` from being a blank site, one sentence each; empty when it is one. */
export function checkBlankSite(sql) {
  const dump = parseDump(sql)
  const problems = [...dump.unparsed]
  for (const r of records(dump, 'menu').filter(isSiteMenuItem))
    problems.push(`site menu item ${r.id} (${r.title})`)
  const site = new Set(
    records(dump, 'modules')
      .filter(isSiteBlock)
      .map((r) => r.id)
  )
  for (const r of records(dump, 'modules_menu')) {
    if (site.has(r.moduleid)) problems.push(`block ${r.moduleid} is assigned to menu item ${r.menuid}`)
  }
  for (const table of [...PAGE_TABLES, ...ACCOUNT_TABLES]) {
    const n = records(dump, table).length
    if (n) problems.push(`${table} row${n > 1 ? 's' : ''}: ${n}`)
  }
  for (const r of records(dump, 'categories').filter((c) => !isKeptCategory(c)))
    problems.push(`category ${r.id} (${r.title})`)
  for (const r of records(dump, 'tags').filter((t) => t.id !== '1')) problems.push(`tag ${r.id} (${r.title})`)
  for (const s of findSecrets(dump)) problems.push(`secret ${s.table} ${s.row} ${s.key}`)
  return problems
}

/** The counts the report and the acceptance evidence show. */
export function countSite(dump) {
  const site = new Set(
    records(dump, 'modules')
      .filter(isSiteBlock)
      .map((r) => r.id)
  )
  const assigned = new Set(
    records(dump, 'modules_menu')
      .filter((r) => site.has(r.moduleid))
      .map((r) => r.moduleid)
  )
  return {
    siteMenuItems: records(dump, 'menu').filter(isSiteMenuItem).length,
    articles: records(dump, 'content').length,
    demoCategories: records(dump, 'categories').filter((c) => !isKeptCategory(c)).length,
    tags: records(dump, 'tags').filter((t) => t.id !== '1').length,
    contacts: records(dump, 'contact_details').length,
    siteBlocks: site.size,
    assignedSiteBlocks: assigned.size,
    users: records(dump, 'users').length,
    sessions: records(dump, 'session').length
  }
}

function remove(ctx, table, predicate) {
  const gone = removeRows(ctx.dump, table, predicate)
  if (gone.length) ctx.removed.set(table, [...(ctx.removed.get(table) ?? []), ...gone])
  return gone
}
