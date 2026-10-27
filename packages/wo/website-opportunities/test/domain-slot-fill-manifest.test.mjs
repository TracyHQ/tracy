import assert from 'node:assert/strict'
import test from 'node:test'
import { forbiddenFillerText, validateSlotFillManifest } from '../domain/slot-fill-manifest.mjs'
import { neutralFor } from '../domain/neutral-copy.mjs'

test('manifest records sourced, composed, neutral and empty slots without changing input', () => {
  const entries = [
    {
      slotKey: 'menu.name.1',
      state: 'sourced',
      locale: 'vi',
      entityId: 'offering:1',
      factRefs: ['fact:name']
    },
    { slotKey: 'about.summary', state: 'composed', locale: 'de-DE', factRefs: ['fact:name', 'fact:address'] },
    {
      slotKey: 'menu.name.2',
      state: 'neutral',
      neutralKey: 'neutral.offering.menu_item',
      locale: 'vi',
      factRefs: []
    },
    { slotKey: 'step.index.1', state: 'neutral', locale: 'ar', factRefs: [] },
    { slotKey: 'person.name.1', state: 'empty', locale: 'xx', factRefs: [] }
  ]
  const before = structuredClone(entries)
  assert.deepEqual(validateSlotFillManifest(entries), { ok: true, errors: [] })
  assert.deepEqual(entries, before)
  assert.deepEqual(validateSlotFillManifest([]), { ok: true, errors: [] })
})

test('manifest refuses malformed entries and contradictory provenance with useful paths', () => {
  for (const input of [undefined, null, {}, 'slots']) {
    assert.equal(validateSlotFillManifest(input).ok, false)
  }
  const base = { slotKey: 'menu.name.1', state: 'sourced', locale: 'en', factRefs: ['fact:name'] }
  for (const [patch, path] of [
    [{ slotKey: '' }, 'slotKey'],
    [{ slotKey: ' ' }, 'slotKey'],
    [{ slotKey: 1 }, 'slotKey'],
    [{ state: 'sample' }, 'state'],
    [{ state: undefined }, 'state'],
    [{ locale: '' }, 'locale'],
    [{ locale: null }, 'locale'],
    [{ entityId: '' }, 'entityId'],
    [{ entityId: 7 }, 'entityId'],
    [{ factRefs: undefined }, 'factRefs'],
    [{ factRefs: 'fact:name' }, 'factRefs'],
    [{ factRefs: [null] }, 'factRefs'],
    [{ factRefs: [' '] }, 'factRefs'],
    [{ factRefs: ['fact:name', 'fact:name'] }, 'factRefs'],
    [{ factRefs: [] }, 'factRefs'],
    [{ state: 'composed', factRefs: [] }, 'factRefs'],
    [{ state: 'neutral' }, 'factRefs'],
    [{ state: 'empty' }, 'factRefs'],
    [{ neutralKey: 'neutral.offering.menu_item' }, 'neutralKey'],
    [{ state: 'neutral', factRefs: [], neutralKey: '' }, 'neutralKey'],
    [{ state: 'neutral', factRefs: [], neutralKey: 7 }, 'neutralKey'],
    [{ state: 'empty', factRefs: [], neutralKey: 'neutral.stat.dash' }, 'neutralKey'],
    [{ sample: true }, 'sample']
  ]) {
    const result = validateSlotFillManifest([{ ...base, ...patch }])
    assert.equal(result.ok, false, JSON.stringify(patch))
    assert.ok(
      result.errors.some((error) => error.includes('entries[0]') && error.includes(path)),
      JSON.stringify(result)
    )
  }
  for (const entry of [null, [], 'entry']) assert.equal(validateSlotFillManifest([entry]).ok, false)
  const duplicate = validateSlotFillManifest([base, { ...base }])
  assert.equal(duplicate.ok, false)
  assert.ok(duplicate.errors.some((error) => error.includes('slotKey')))
})

test('forbidden filler matching covers all site languages and ignores case and typographic apostrophes', () => {
  const phrases = [
    'Coming soon',
    "Chef's selection",
    'Seasonal special',
    'House favourite',
    'House favorite',
    'Market price',
    'Sắp ra mắt',
    'Lựa chọn của bếp trưởng',
    'Món đặc biệt theo mùa',
    'Món được yêu thích của quán',
    'Giá thị trường',
    'Demnächst',
    'Auswahl des Küchenchefs',
    'Saisonales Spezialgericht',
    'Liebling des Hauses',
    'Marktpreis',
    'Prossimamente',
    'Selezione dello chef',
    'Specialità stagionale',
    'Preferito della casa',
    'Prezzo di mercato',
    'Bientôt disponible',
    'Sélection du chef',
    'Spécialité de saison',
    'Favori de la maison',
    'Prix du marché',
    'Binnenkort',
    'Selectie van de chef',
    'Seizoensspecialiteit',
    'Favoriet van het huis',
    'Marktprijs',
    '即将推出',
    '主厨精选',
    '时令特餐',
    '本店人气菜',
    '时价',
    'Próximamente',
    'Selección del chef',
    'Especial de temporada',
    'Favorito de la casa',
    'Precio de mercado',
    '近日公開',
    'シェフのおすすめ',
    '季節のおすすめ',
    '当店の人気メニュー',
    '時価',
    'قريباً',
    'اختيار الشيف',
    'طبق موسمي خاص',
    'المفضل لدى المطعم',
    'سعر السوق'
  ]
  for (const phrase of phrases) {
    assert.equal(forbiddenFillerText(phrase), true, phrase)
    assert.equal(forbiddenFillerText(`  ${phrase.toUpperCase()}  `), true, phrase)
    assert.deepEqual(neutralFor({ role: 'stat.value', policy: { policy: 'literal', value: phrase } }), {
      state: 'empty',
      text: ''
    })
  }
  assert.equal(forbiddenFillerText('Chef’s selection'), true)
  assert.equal(forbiddenFillerText('Coming\nsoon'), true)
  for (const text of [
    undefined,
    null,
    42,
    {},
    '',
    'Menu item',
    'Service',
    'Team',
    '—',
    'Contact',
    'Market price changes daily',
    'Our chef selects dishes'
  ]) {
    assert.equal(forbiddenFillerText(text), false)
  }
})
