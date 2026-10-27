/** Replace seed taxonomy copy without changing routes, membership or publication state. */
import { readFileSync } from 'node:fs'
import { emdashToolFor } from '../../lib/emdash-tool.js'
import { qualityHash } from '../../lib/quality-hash.js'
import { editQuickstart } from './quickstart-editorial.js'
const fail = (code) => Object.assign(new Error(code), { code })
const enc = encodeURIComponent
const rawData = (snapshot) => (snapshot.dataRaw === null ? {} : JSON.parse(snapshot.dataRaw))
const fixed = ({ label: _label, dataRaw: _data, _rev: _revision, ...rest }) => rest

export async function replaceQuickstartTerms({
  adapter,
  ctx,
  sources,
  generate,
  held,
  checkpoint,
  checkAllowed,
  seed: providedSeed
}) {
  if (!adapter.api) return { state: 'not-applicable' }
  const tool = providedSeed ? null : emdashToolFor(ctx.quickstart)
  if (!providedSeed && !tool) return { state: 'not-applicable' }
  const seed = providedSeed ?? JSON.parse(readFileSync(`${tool.seedDir}/seed.json`, 'utf8'))
  const locale = ctx.normalized.languages?.[0] ?? seed.defaultLocale
  const taxonomies = (seed.taxonomies ?? []).filter((tax) => (tax.locale ?? seed.defaultLocale) === locale)
  if (!taxonomies.length) return { state: 'not-applicable' }
  const cap = await adapter.api('GET', '/_emdash/api/write-capabilities')
  if (cap.conditionalTermMetadata !== true || cap.mutationRevisionReceipts !== true)
    throw fail('QUICKSTART_TERM_CAS_REQUIRED')
  const targets = [],
    pending = []
  for (const tax of taxonomies) {
    const list = await adapter.api(
      'GET',
      `/_emdash/api/taxonomies/${enc(tax.name)}/terms?locale=${enc(locale)}`
    )
    const flatten = (rows) => rows.flatMap((term) => [term, ...flatten(term.children ?? [])])
    const terms = flatten(list.terms ?? [])
    for (const original of tax.terms ?? []) {
      const matches = terms.filter((term) => term.slug === original.slug && term.locale === locale)
      if (matches.length !== 1) throw fail('QUICKSTART_TERM_SCOPE_CHANGED')
      const term = matches[0],
        key = `term:${tax.name}:${term.id}`
      const path = `/_emdash/api/taxonomies/${enc(tax.name)}/term-metadata/${enc(term.id)}?locale=${enc(locale)}`
      const before = await adapter.api('GET', path)
      if (
        !before._rev ||
        before.id !== term.id ||
        before.name !== tax.name ||
        before.locale !== locale ||
        before.slug !== original.slug ||
        !Array.isArray(before.associations)
      )
        throw fail('QUICKSTART_TERM_SNAPSHOT_REQUIRED')
      targets.push({ key, path, before })
      const prior = held[`quickstart:${key}`]
      if (
        prior &&
        !(
          prior.state === 'rejected' &&
          prior.status === 400 &&
          qualityHash(before) === qualityHash(prior.before) &&
          prior.unchanged === true
        )
      ) {
        if (prior.state !== 'verified' || qualityHash(before) !== qualityHash(prior.after))
          throw fail('QUICKSTART_TERM_RECONCILIATION_REQUIRED')
        continue
      }
      if (
        before.label !== original.label ||
        (rawData(before).description ?? '') !== (original.description ?? '')
      )
        throw fail('QUICKSTART_TERM_SOURCE_CHANGED')
      const copy = {
        label: before.label,
        ...(original.description ? { description: original.description } : {})
      }
      pending.push({
        key,
        copy,
        context: {
          taxonomy: tax.name,
          associatedEntries: before.associations,
          purpose: 'Public topic labels for the real business, preserving existing article membership.'
        }
      })
    }
  }
  if (pending.length) {
    const edited = await editQuickstart({
      records: pending,
      sources,
      generate,
      locale,
      signal: ctx.signal,
      recordBatch: (batch) => checkpoint(`term-batch:${batch.inputHash}`, { state: 'validated', ...batch })
    })
    for (const record of edited.records) {
      const { key, path, before } = targets.find((target) => target.key === record.key)
      await checkAllowed()
      if (qualityHash(await adapter.api('GET', path)) !== qualityHash(before))
        throw fail('QUICKSTART_TERM_SOURCE_CHANGED')
      const fields = record.copy
      await checkpoint(key, { state: 'sending', before, fields })
      let put
      try {
        put = await adapter.api('PUT', path, {
          mode: 'patch',
          _rev: before._rev,
          slug: before.slug,
          ...fields
        })
      } catch (error) {
        if (error.status === 400 && qualityHash(await adapter.api('GET', path)) === qualityHash(before))
          await checkpoint(key, { state: 'rejected', status: 400, unchanged: true, before, fields })
        throw error
      }
      if (!put._mutationRev) throw fail('QUICKSTART_TERM_MUTATION_RECEIPT_REQUIRED')
      const after = await adapter.api('GET', path)
      const expectedData = {
        ...rawData(before),
        ...(fields.description === undefined ? {} : { description: fields.description })
      }
      if (
        after._rev !== put._mutationRev ||
        after.label !== fields.label ||
        qualityHash(fixed(after)) !== qualityHash(fixed(before)) ||
        qualityHash(rawData(after)) !== qualityHash(expectedData)
      )
        throw fail('QUICKSTART_TERM_READBACK_FAILED')
      await checkpoint(key, { state: 'verified', before, fields, after })
    }
  }
  return { state: 'verified', terms: targets.length }
}
