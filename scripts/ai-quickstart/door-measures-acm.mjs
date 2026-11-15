/**
 * `door-measures.mjs` part C: what the JA ACM marker converter does with markers it was not made for, and whether
 * each field value of every ACM layout the block store uses (and of mod_custom and the module chrome) is escaped
 * where the page prints it.
 */
import { around, count, K, probeState } from './door-measures-lib.mjs'

const parse = (record) => JSON.parse(JSON.parse(record.params)['jatools-config'])
// A copy needs a title: Joomla saves no module without one, and the blank site emptied some store titles.
const writeConfig = (record, config) => {
  const params = JSON.parse(record.params)
  params['jatools-config'] = JSON.stringify(config)
  return {
    ...K.copyFields(record),
    title: record.title || `Measure ${record.id}`,
    params: JSON.stringify(params)
  }
}
// Numbers a layout computes with (a probe there stops the page) and the container's position.
const NUMERIC = /\[(columns|show-on|gutter|col|colmb|coltb|coldt|position)\]$/

/** A letters-only tag per probe: `MZ` and three letters of the number. */
const tagOf = (n) =>
  `MZ${[676, 26, 1].map((d) => String.fromCharCode(65 + (Math.floor(n / d) % 26))).join('')}`

export async function measureMarkers(ctx) {
  const { door, fact } = ctx
  const landing = await ctx.page('Measure Probe Landing', ctx.styles.LANDING)
  const inner = await ctx.page('Measure Probe Inner', ctx.styles.DEFAULT)
  const pages = [landing, inner]
  const assign = (id) => door.made('moduleAssignment', id, { menuids: JSON.stringify(pages) })
  const both = async () => (await ctx.html(landing)).html + (await ctx.html(inner)).html

  // C7. Markers the converter was not made for, in the titles and descriptions of a features-intro copy.
  const markerCases = {
    'features-intro[title]': [
      'MKA((free))x((/free))',
      'MKB((script))console.log("measure")((/script))',
      'MKC((span))open',
      'MKD((span))a((b))b((/b))c((/span))'
    ],
    'features-intro[description]': [
      'MKE((span class="hl" data-x="1"))x((/span))',
      'MKF Kids (6+)) and ((more',
      'MKG one((br))two((br/))three',
      'MKH((SPAN))caps((/SPAN))'
    ]
  }
  const store157 = await door.get('module', 157)
  const config = parse(store157)
  for (const [key, values] of Object.entries(markerCases)) config['features-intro'][key] = values
  config['features-intro']['features-intro[img-icon]'] = ['', '', '', '']
  const markersCopy = await door.made('module', 0, writeConfig(store157, config))
  await assign(markersCopy)
  // A marker in a module setting the chrome prints (not in the ACM config): converted or not.
  const chromeCopy = await door.made('module', 0, {
    ...K.copyFields(store157),
    params: JSON.stringify({ ...JSON.parse(store157.params), 'main-section': 'MKI((b))x((/b))' }),
    showtitle: 1,
    title: 'MKJ((b))title((/b))'
  })
  await assign(chromeCopy)
  const markersPage = await both()
  const marks = ['MKA', 'MKB', 'MKC', 'MKD', 'MKE', 'MKF', 'MKG', 'MKH', 'MKI', 'MKJ']
  fact('C7 ACM markers', {
    modules: { markers: markersCopy, chrome: chromeCopy },
    stored: Object.values(markerCases).flat(),
    printed: Object.fromEntries(marks.map((m) => [m, around(markersPage, m, 0, 80) ?? null]))
  })

  // C8. One probe in every field of every ACM layout the store uses: `<tag>"'<>&((i))`.
  const acm = ctx.store.blocks
    .map((b) => ctx.mapping.placements[b.id]?.entity)
    .filter((e) => ctx.mapping.entities[e]?.identity?.module === 'mod_ja_acm')
  const probes = []
  let n = 0
  for (const entity of new Set(acm)) {
    const id = Number(entity.split('-')[1])
    const record = await door.get('module', id)
    const config = parse(record)
    const type = config[':type'].split(':')[1]
    const data = config[type]
    const layout = data[`jatools-layout-${type}`]
    const probe = (field, i) => {
      const tag = tagOf(n++)
      probes.push({ module: id, layout: `${type}:${layout}`, field, row: i, tag })
      return `${tag}"'<>&((i))`
    }
    const fill = (node) => {
      for (const [key, value] of Object.entries(node)) {
        if (key.startsWith('jatools-layout') || NUMERIC.test(key)) continue
        if (Array.isArray(value))
          node[key] = value.map((v, i) => (i < 2 && typeof v === 'string' ? probe(key, i) : v))
        else if (value && typeof value === 'object') fill(value)
      }
    }
    fill(data)
    if (type === 'gallery') data['isotope[show-on]'] = ['1']
    const copy = await door.made('module', 0, writeConfig(record, config))
    await assign(copy)
    probes.filter((p) => p.module === id).forEach((p) => (p.copy = copy))
  }
  // mod_custom and the module chrome: the title (shown), the chrome's settings and mod_custom's background picture.
  const custom = await door.get('module', 170)
  const chromeProbe = (field) => {
    const tag = tagOf(n++)
    probes.push({ module: 170, layout: 'mod_custom + t4section chrome', field, row: 0, tag })
    return `${tag}"'<>&((i))`
  }
  const customParams = {
    ...JSON.parse(custom.params),
    backgroundimage: chromeProbe('params.backgroundimage'),
    'main-section': chromeProbe('params.main-section'),
    'top-desc': chromeProbe('params.top-desc'),
    'section-link': '1',
    'title-btn': chromeProbe('params.title-btn'),
    'link-btn': chromeProbe('params.link-btn'),
    'type-btn': chromeProbe('params.type-btn'),
    moduleclass_sfx: chromeProbe('params.moduleclass_sfx'),
    header_class: chromeProbe('params.header_class')
  }
  const customCopy = await door.made('module', 0, {
    ...K.copyFields(custom),
    title: chromeProbe('title'),
    showtitle: 1,
    // A section position, drawn with the template's section chrome (the store position uses the footer's).
    position: 'section-1',
    content: `<p>${chromeProbe('content')}</p>`,
    params: JSON.stringify(customParams)
  })
  await assign(customCopy)
  probes.filter((p) => p.module === 170).forEach((p) => (p.copy = customCopy))

  const html = await both()
  for (const p of probes) {
    p.printed = probeState(html, p.tag)
    p.times = count(html, p.tag)
    const at = html.indexOf(p.tag)
    const before = at < 0 ? '' : html.slice(Math.max(0, at - 300), at)
    // Inside a tag when the last `<` before the probe comes after the last `>`: then the attribute it is in.
    p.context =
      at < 0
        ? null
        : before.lastIndexOf('<') > before.lastIndexOf('>')
          ? `attribute ${(before.match(/([\w:-]+)\s*=\s*["']?[^"'<>=]*$/) ?? [])[1] ?? '?'}`
          : 'text'
    p.markerAfter = at < 0 ? null : html.slice(at + p.tag.length, at + p.tag.length + 40)
  }
  fact('C8 escaping of field values', { pages, probes })
}
