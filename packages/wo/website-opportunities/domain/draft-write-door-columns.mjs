// The columns the record door (`content.update`) writes, per record kind, as measured on plugin 0.24.85 (release gate,
// real write of the JA Boxing marker plan). Pure. The door keeps a whitelist per kind and drops every other column of
// the call without a word: a created article sent `created` and `created_by_alias` was stored with neither (`created`
// is the site's own UTC time of the write, the author name empty), and an update naming only such columns is refused
// (`write_failed`, "no writable column for kind article"). A kind not listed here was read back whole on that run
// (categories, menu items, contacts, modules): it is not restricted by this list.
//
// Used by the plan (no column outside the list is sent: `draft-write-record-columns.mjs`, the run's dates) and by the
// memory site (`write-order-memory-rules.mjs`), which keeps only these columns, so a test catches a column the door
// would drop. Spec: docs/references/draft-write-step.md, "Columns the record door writes".

export const DOOR_COLUMNS = Object.freeze({
  article: Object.freeze([
    'title',
    'alias',
    'introtext',
    'fulltext',
    'state',
    'catid',
    'images',
    'urls',
    'attribs',
    'metadata',
    'metakey',
    'metadesc',
    'language',
    'featured',
    'ordering',
    'access',
    'publish_up',
    'publish_down',
    'note'
  ])
})

/** Whether the door writes `column` of a record of `kind` (a kind not measured: yes). */
export const doorWrites = (kind, column) => !DOOR_COLUMNS[kind] || DOOR_COLUMNS[kind].includes(column)

/** The fields of a call as the door keeps them: the columns it does not write taken out. */
export const doorKept = (kind, fields) =>
  DOOR_COLUMNS[kind]
    ? Object.fromEntries(Object.entries(fields ?? {}).filter(([column]) => doorWrites(kind, column)))
    : fields
