// Field-map actions use the same plan as contract slots, then the existing revision-checked EmDash writer.
import { declaredButtonSlots } from 'website-opportunities/domain/declared-button-plan.mjs'
import { buttonActionValues } from './button-action-values.js'
import { writeWoCopy } from './emdash-wo-copy.js'

/** Bind declared scalar fields to each source entry. Paths come only from the released field map. */
export function emdashButtonMap(fieldMap, seed) {
  const slots = []
  const pages = []
  const locale = seed.defaultLocale ?? 'en'
  for (const collection of fieldMap?.collections ?? []) {
    for (const entry of seed.content?.[collection.collection] ?? []) {
      if ((entry.locale ?? locale) !== locale) continue
      const entity = `${collection.collection}.${entry.slug}`
      if (collection.urlPattern)
        pages.push({ entity, route: collection.urlPattern.replace('{slug}', entry.slug) })
      for (const field of collection.fields ?? []) {
        if (typeof entry.data?.[field.slug] !== 'string') {
          if (field.action)
            throw Object.assign(
              new Error(`The declared action has no writable scalar field: ${entity}.${field.slug}`),
              { code: 'BUTTON_ACTION_BINDING_REQUIRED' }
            )
          continue
        }
        const action = field.action ? structuredClone(field.action) : null
        if (action?.urlKey && !action.urlKey.startsWith(`${entity}.`)) {
          const urlField = action.urlKey.replace(new RegExp(`^${collection.collection}\\.`), '')
          action.urlKey = `${entity}.${urlField}`
        }
        slots.push({
          key: `${entity}.${field.slug}`,
          entity,
          type: /(?:url|href)$/.test(field.slug) ? 'url' : 'text',
          sample: entry.data[field.slug],
          role: field.role ?? null,
          ...(action ? { action } : {}),
          maxCharacters: field.maxCharacters ?? 120,
          collection: collection.collection,
          slug: entry.slug,
          field: field.slug
        })
      }
    }
  }
  return { slots, pages }
}

/** Build action writes after the native personalize tool and sourced copy, preserving receipts and readback checks. */
export async function writeEmdashButtonActions({
  api,
  fieldMap,
  seed,
  sitePlan,
  locale = 'en',
  model = null,
  signal,
  note = () => {},
  woContent,
  buildId
}) {
  const contentMap = emdashButtonMap(fieldMap, seed)
  if (!contentMap.slots.some((s) => s.action)) return { written: 0, skipped: 0, conflict: 0, failed: 0 }
  const decisions = declaredButtonSlots({ primaryAction: sitePlan?.primaryAction }, contentMap)
  const values = await buttonActionValues({
    sitePlan: { slots: decisions },
    locale,
    slots: contentMap.slots,
    model,
    signal,
    note
  })
  const map = { roles: {} }
  const pinned = {}
  for (const slot of contentMap.slots) {
    if (!(slot.key in values)) continue
    map.roles[slot.key] = {
      collection: slot.collection,
      slug: slot.slug,
      fields: [{ field: slot.field, from: 'value' }]
    }
    pinned[slot.key] = {
      value: values[slot.key],
      source: slot.type === 'url' ? 'brief.primaryAction.href' : 'content-map.action'
    }
  }
  const noop = async () => {}
  const done = await writeWoCopy({
    api,
    map,
    seed,
    copy: { buildId, pinned },
    locale,
    note,
    woContent: {
      recordBefore: buildId && woContent?.recordBefore ? woContent.recordBefore.bind(woContent) : noop,
      recordWrite: buildId && woContent?.recordWrite ? woContent.recordWrite.bind(woContent) : noop
    }
  })
  if (done.failed || done.conflict || done.written === 0)
    throw Object.assign(new Error('Declared button actions did not read back from the EmDash site'), {
      code: 'BUTTON_ACTION_WRITE_FAILED'
    })
  return done
}
