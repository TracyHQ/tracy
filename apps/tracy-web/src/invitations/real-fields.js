import { REAL_GROUPS } from './real-import.js'
import { realError } from './real-store.js'

const BUILTINS = ['first_name', 'company', 'plan', 'last_template', 'website', 'cms', 'group']
const RESERVED = new Set([
  ...BUILTINS,
  '__proto__',
  'prototype',
  'constructor',
  'email',
  'destination',
  'eligibility',
  'internal',
  'stop',
  'suppressed',
  'sending_enabled',
  'invitation_url',
  'unsubscribe_url',
  'footer'
])
export function realRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [null, Object.prototype].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).every(
      (k) =>
        typeof k === 'string' &&
        !['__proto__', 'prototype', 'constructor'].includes(k) &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, k), 'value')
    )
  )
}
function scalar(value) {
  return typeof value === 'string' && Buffer.byteLength(value) <= 16384
}
function closed(value, allowed) {
  return realRecord(value) && Object.keys(value).every((k) => allowed.includes(k))
}
export function defaultRegistry(headers = []) {
  const column = (key, label, name, missing = 'required') => ({
    key,
    label,
    source: headers.includes(name) ? { kind: 'column', column: name } : { kind: 'manual' },
    missing
  })
  return {
    revision: 1,
    fields: [
      {
        key: 'first_name',
        label: 'First name',
        source: { kind: 'manual' },
        missing: 'default',
        defaultValue: 'there'
      },
      column('company', 'Company', 'cong_ty'),
      column('plan', 'Plan at source date', 'goi'),
      column('last_template', 'Last downloaded template', 'template_tai_gan_nhat', 'omit'),
      column('website', 'Website', 'website'),
      column('cms', 'CMS', 'cms', 'omit'),
      { key: 'group', label: 'Source group', source: { kind: 'manual' }, missing: 'required' }
    ],
    campaignValues: {},
    groupValues: {}
  }
}
export function validateRegistry({ registry, headers, storedValues = false }) {
  if (
    !closed(registry, ['revision', 'fields', 'campaignValues', 'groupValues']) ||
    !Number.isSafeInteger(registry.revision) ||
    registry.revision < 1 ||
    !Array.isArray(headers) ||
    !headers.every((h) => typeof h === 'string') ||
    new Set(headers).size !== headers.length ||
    !Array.isArray(registry.fields) ||
    registry.fields.length > 107 ||
    !realRecord(registry.campaignValues) ||
    !realRecord(registry.groupValues)
  )
    throw realError('REAL_INVALID_REGISTRY')
  const keys = new Set()
  for (const f of registry.fields) {
    if (
      !closed(f, ['key', 'label', 'source', 'missing', 'defaultValue']) ||
      typeof f.key !== 'string' ||
      keys.has(f.key) ||
      (!BUILTINS.includes(f.key) &&
        (!/^custom\.[a-z][a-z0-9_]{0,63}$/.test(f.key) || RESERVED.has(f.key.slice(7)))) ||
      typeof f.label !== 'string' ||
      !f.label.trim() ||
      [...f.label].length > 120 ||
      !['required', 'default', 'omit'].includes(f.missing) ||
      !closed(f.source, ['kind', 'column']) ||
      !['manual', 'column'].includes(f.source.kind)
    )
      throw realError('REAL_INVALID_FIELD')
    if (f.source.kind === 'column' ? !headers.includes(f.source.column) : Object.hasOwn(f.source, 'column'))
      throw realError('REAL_INVALID_FIELD_SOURCE')
    if (
      (Object.hasOwn(f, 'defaultValue') && !scalar(f.defaultValue)) ||
      (f.missing === 'default' && (!scalar(f.defaultValue) || !f.defaultValue.trim()))
    )
      throw realError('REAL_INVALID_FIELD_DEFAULT')
    if (
      f.key === 'group' &&
      (f.source.kind !== 'manual' || f.missing !== 'required' || Object.hasOwn(f, 'defaultValue'))
    )
      throw realError('REAL_RESERVED_FIELD')
    if (f.key === 'first_name' && (f.missing !== 'default' || f.defaultValue !== 'there'))
      throw realError('REAL_RESERVED_FIELD')
    keys.add(f.key)
  }
  if (BUILTINS.some((k) => !keys.has(k))) throw realError('REAL_INVALID_REGISTRY')
  const values = (v) => {
    if (!realRecord(v)) throw realError('REAL_INVALID_FIELD_VALUES')
    for (const [key, value] of Object.entries(v))
      if (
        !scalar(value) ||
        key === 'group' ||
        !registry.fields.some((f) => f.key === key && (storedValues || f.source.kind === 'manual'))
      )
        throw realError('REAL_INVALID_FIELD_VALUES')
  }
  values(registry.campaignValues)
  for (const [group, v] of Object.entries(registry.groupValues)) {
    if (!REAL_GROUPS.some((g) => g.key === group)) throw realError('REAL_INVALID_GROUP')
    values(v)
  }
  return structuredClone(registry)
}
export function resolveFields({
  registry,
  rawSource,
  group,
  groupLabel,
  recipientValues = {},
  storedValues = false
}) {
  if (
    !realRecord(rawSource) ||
    !Array.isArray(rawSource.headers) ||
    !Array.isArray(rawSource.values) ||
    rawSource.headers.length !== rawSource.values.length ||
    !rawSource.values.every(scalar) ||
    !realRecord(recipientValues)
  )
    throw realError('REAL_INVALID_SOURCE')
  const r = validateRegistry({ registry, headers: rawSource.headers, storedValues: true }),
    g = REAL_GROUPS.find((g) => g.key === group)
  if (!g) throw realError('REAL_INVALID_GROUP')
  for (const [key, value] of Object.entries(recipientValues))
    if (
      !scalar(value) ||
      key === 'group' ||
      !r.fields.some((f) => f.key === key && (storedValues || f.source.kind === 'manual'))
    )
      throw realError('REAL_INVALID_FIELD_VALUES')
  const values = Object.create(null),
    presence = Object.create(null),
    provenance = Object.create(null)
  for (const f of r.fields) {
    let value,
      from = 'missing'
    if (f.key === 'group') {
      value = groupLabel ?? g.label
      from = 'source_group'
    } else if (f.source.kind === 'column') {
      value = rawSource.values[rawSource.headers.indexOf(f.source.column)]
      from = `column:${f.source.column}`
    } else
      for (const [source, record] of [
        ['recipient', recipientValues],
        ['group', r.groupValues[group] ?? {}],
        ['campaign', r.campaignValues]
      ])
        if (Object.hasOwn(record, f.key) && record[f.key].trim()) {
          value = record[f.key]
          from = source
          break
        }
    if (!value?.trim()) {
      value = f.missing === 'default' ? f.defaultValue : undefined
      from = value ? 'default' : 'missing'
    }
    if (value !== undefined) values[f.key] = value
    presence[f.key] = value !== undefined && value.trim().length > 0
    provenance[f.key] = from
  }
  return { values, presence, provenance }
}
