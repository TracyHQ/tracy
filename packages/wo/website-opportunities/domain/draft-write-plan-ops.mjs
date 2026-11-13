// The door operations of the draft write in the order they run (ticket #597): the pictures (stored bytes, no page
// needed), the home page before every other record (a blank site answers a server error until a home page exists),
// the categories, the created records, the other menu items, the copies (a container before the copies it holds),
// their assignment, the container positions, the in-place writes through the blank site contract (one apply per
// record, so a module title the blank site emptied goes with that module's first other value), the site identity and
// the look. Pure; part of `writePlanOf`. One record's operation:
// `draft-write-plan-records.mjs`.

import { aliasesOf, assignOf, copyOp, createOp, drawOf, valuesOf } from './draft-write-plan-records.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
/** The fields `site.identity` writes (its read answers these and no other key of the configuration file). */
export const IDENTITY_FIELDS = ['sitename', 'MetaDesc', 'sitename_pagetitles']

/**
 * The site identity: the fields its door writes. A fact place on another key (Joomla's mail sender name, `fromname`)
 * has no door: it is left to the installer and reported `identity_field_no_door`.
 */
function identityOp(state, record) {
  const values = valuesOf(record).filter((v) => {
    if (IDENTITY_FIELDS.includes(v.loc.column)) return true
    state.sink.unproven.push({ code: 'identity_field_no_door', column: v.loc.column })
    return false
  })
  return {
    key: 'identity',
    kind: 'site.identity',
    record: record.key,
    values,
    entries: record.entries,
    rules: ['fact:name']
  }
}
const RANK = { category: 1, article: 2, contact: 2, user: 2, tag: 2, userProfile: 2, field: 2 }

/**
 * The ordered operations.
 * @param {object} state the planner's state, every record settled
 * @returns {object[]}
 */
export function opsOf(state) {
  const records = [...state.sink.records.values()]
  const created = records.filter((r) => r.kind === 'created')
  aliasesOf(created)
  const pictures = [...state.pictures.values()].map((p) => ({
    key: `picture:${p.id}`,
    kind: 'picture.upload',
    picture: p.id,
    pictureKind: p.kind,
    stored: state.stored?.[p.id] ?? null,
    ref: p.picture.ref ?? null,
    alt: p.picture.alt ?? null,
    initials: p.picture.substitute?.initials ?? null,
    ...drawOf(p.picture),
    entries: [],
    rules: [p.picture.source === 'initials' ? 'initials_drawn_in_frame' : 'pictures_from_stored_bytes']
  }))
  const menus = created.filter((r) => r.recordKind === 'menuItem')
  const home = menus.filter((r) => r.home)
  // Every page item of the main menu before the items of other menus, which link to them (`page:` alias).
  const main = menus.filter((r) => !r.home && r.menutype === state.kit.mainMenu)
  const rest = menus.filter((r) => !r.home && r.menutype !== state.kit.mainMenu)
  const others = created
    .filter((r) => r.recordKind !== 'menuItem')
    .sort((a, b) => (RANK[a.recordKind] ?? 3) - (RANK[b.recordKind] ?? 3))
  const copies = records
    .filter((r) => r.kind === 'copy')
    .sort((a, b) => Number(Boolean(b.tabsAt)) - Number(Boolean(a.tabsAt)))
  const stores = records.filter((r) => r.kind === 'store')
  const ops = [
    ...pictures,
    ...home.map(createOp),
    ...others.map(createOp),
    ...main.map(createOp),
    ...rest.map(createOp),
    ...copies.map(copyOp),
    ...records
      .filter((r) => r.kind === 'library')
      .map((r) => ({
        key: r.key,
        kind: 'library.create',
        record: r.key,
        mark: r.key,
        html: r.html,
        expects: r.expects ?? [],
        position: r.position,
        page: r.page,
        ordering: r.rank ?? null,
        containerClass: state.kit.mapping.library?.containerClass ?? null,
        entries: r.entries,
        rules: ['library.position', 'ordering:page_rank']
      })),
    ...[...copies, ...stores]
      .map((r) => assignOf(r, state.kit.mapping.placements?.[r.block]))
      .filter(Boolean),
    ...copies
      .filter((r) => r.tabsAt)
      .map((r) => ({
        key: `tabs:${r.key}`,
        kind: 'module.position',
        record: r.key,
        loc: r.tabsAt,
        entries: [],
        rules: ['holds.position']
      })),
    ...stores
      .filter((r) => r.values.size || list(r.contractRemoves).length)
      .map((r) => ({
        key: `contract:${r.key}`,
        kind: 'contract.apply',
        record: r.key,
        entity: r.entity,
        values: valuesOf(r),
        removes: list(r.contractRemoves),
        entries: r.entries,
        rules: [...r.rules, 'one_apply_per_record']
      })),
    ...stores
      .filter((r) => list(r.settings).length)
      .map((r) => ({
        key: `settings:${r.key}`,
        kind: 'record.patch',
        record: r.key,
        recordKind: r.recordKind,
        sourceId: r.sourceId,
        values: r.settings.map((s) => ({ ...s, entry: null })),
        entries: [],
        rules: ['hides.setting']
      })),
    ...records.filter((r) => r.kind === 'identity' && r.values.size).map((r) => identityOp(state, r)),
    ...records
      .filter((r) => r.kind === 'look')
      .map((r) => ({
        key: 'look',
        kind: 'look.accent',
        record: r.key,
        accent: r.accent,
        accentDark: r.accentDark,
        variables: r.variables,
        // Nothing writes the accent yet: its entries are skipped (`planLook`), never counted written.
        entries: [],
        rules: ['look'],
        ...(r.variables ? {} : { unproven: 'accent_variables_not_declared' })
      }))
  ]
  return ops
}
