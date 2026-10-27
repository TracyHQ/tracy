// The ACM field kinds a from-joomla theme beyond Tracy Base needs (JA Kinetic): a header whose menu
// is written inline, a table rebuilt from rows, social links from `service|url` lines, a layout
// field that picks the pattern, the section anchor, class families picked by one key, and a card
// URL on a group that has no <a>, a column count drawn as `hx-cols-<n>`, containers a pattern draws empty
// on purpose, and a view whose body is one of the theme's blocks. Each test names the map shape it stands for.
import test from 'node:test'
import assert from 'node:assert/strict'
import { renderAcm, fillNavigationRefs, acmPattern, buildPageContent } from '../seed.mjs'
import { checkMarkup } from '../lib/block-fill.mjs'

const media = () => null
const one = (type, fields, items = [], id = '7') => ({ id, type, style: 'style-1', fields, items })
const render = (map, patterns, inst) => {
  const out = renderAcm(inst, { types: map }, patterns, media)
  assert.equal(checkMarkup(out.markup), true)
  return out
}

test('fillNavigationRefs: an inline navigation is the theme\'s own menu — kept as written, no ref taken', () => {
  const part = [
    '<!-- wp:navigation {"className":"tracy-nav","overlayMenu":"always","layout":{"type":"flex"}} -->',
    '<!-- wp:navigation-link {"label":"Pricing","url":"/pricing","type":"custom"} /-->',
    '<!-- wp:navigation-link {"label":"Start","url":"/start","type":"custom","className":"cta"} /-->',
    '<!-- /wp:navigation -->',
    '<!-- wp:navigation {"className":"footer"} /-->'
  ].join('\n')
  const out = fillNavigationRefs(part, [11])
  assert.equal(out.split('\n').slice(0, 4).join('\n'), part.split('\n').slice(0, 4).join('\n'))
  assert.match(out, /<!-- wp:navigation \{"ref":11,"className":"footer"\} \/-->$/, 'the self-closing block still takes the first ref')
})

const TABLE_PATTERN = [
  '<!-- wp:group {"tagName":"section","className":"acm-matrix"} -->\n<section class="wp-block-group acm-matrix">',
  '<!-- wp:table {"className":"m","metadata":{"role":"content","name":"matrix.rows"}} -->',
  '<figure class="wp-block-table m"><table><thead><tr><th scope="col" class="corner">FEATURE</th><th scope="col">A</th><th scope="col">B</th></tr></thead>',
  '<tbody><tr class="grp"><td colspan="3">Old group</td></tr>',
  '<tr><th scope="row" class="lbl">Old</th><td><span class="dash" aria-hidden="true">—</span></td><td><svg class="ok" aria-hidden="true"><path d="M1 1"></path></svg></td></tr>',
  '<tr><th scope="row" class="lbl">Old 2</th><td><span class="cell">5 GB</span></td><td><span class="dash" aria-hidden="true">—</span></td></tr></tbody></table></figure>',
  '<!-- /wp:table -->\n</section>\n<!-- /wp:group -->'
].join('')
const TABLE_MAP = {
  'matrix:style-1': {
    pattern: 'x/matrix',
    fields: {
      corner_label: { block: 'core/table', path: 'matrix.rows', attr: 'table', repeat: null },
      col1_name: { block: 'core/table', path: 'matrix.rows', attr: 'table', repeat: null },
      col2_name: { block: 'core/table', path: 'matrix.rows', attr: 'table', repeat: null },
      items: { block: 'core/table', path: 'matrix.rows', attr: 'table', repeat: 'rows' }
    }
  }
}

test('renderAcm, attr table: header cells from the unrepeated fields in map order, body rows rebuilt from the items', () => {
  const { markup, notes } = render(
    TABLE_MAP,
    { 'x/matrix': TABLE_PATTERN },
    one('matrix', { corner_label: 'FEATURE', col1_name: 'Free', col2_name: 'Team' }, [
      { group: 'Ingest', label: '', free_cell: '', team_cell: '' },
      { group: '', label: 'Monthly ingest', free_cell: '10 GB', team_cell: 'Unlimited' },
      { group: '', label: 'SSO', free_cell: 'no', team_cell: 'yes' }
    ])
  )
  assert.deepEqual(notes, [])
  assert.match(markup, /<thead><tr><th scope="col" class="corner">FEATURE<\/th><th scope="col">Free<\/th><th scope="col">Team<\/th><\/tr><\/thead>/)
  const body = /<tbody>([^]*)<\/tbody>/.exec(markup)[1]
  assert.equal((body.match(/<tr/g) ?? []).length, 4, 'one divider row + three item rows')
  assert.match(body, /^<tr class="grp"><td colspan="3">Ingest<\/td><\/tr><tr><th scope="row" class="lbl"><\/th><td><span class="dash" aria-hidden="true">—<\/span><\/td><td><span class="dash"/)
  assert.match(body, /<th scope="row" class="lbl">Monthly ingest<\/th><td><span class="cell">10 GB<\/span><\/td><td><span class="cell">Unlimited<\/span><\/td>/)
  assert.match(body, /<th scope="row" class="lbl">SSO<\/th><td><span class="dash" aria-hidden="true">—<\/span><\/td><td><svg class="ok"/, 'no → the blank cell, yes → the mark cell')
  assert.doesNotMatch(markup, /Old/, 'the pattern\'s own rows are gone')
})

test('renderAcm, attr table: a row the pattern cannot draw keeps the table and says why', () => {
  const { markup, notes } = render(
    TABLE_MAP,
    { 'x/matrix': TABLE_PATTERN },
    one('matrix', { corner_label: 'F', col1_name: 'A', col2_name: 'B' }, [{ group: '', label: 'x', a: '1', b: '2', c: '3' }])
  )
  assert.match(markup, /Old 2/)
  assert.deepEqual(notes, ['7 matrix.items: table kept, an item has 4 cells for 3 columns'])
})

test('renderAcm, attr links: one social link per service|url line, the pattern\'s first link the template; empty drops the block', () => {
  const pattern =
    '<!-- wp:group {"className":"team"} -->\n<div class="wp-block-group team"><!-- wp:social-links {"className":"s","metadata":{"role":"content","name":"team.socials.1"}} -->\n<ul class="wp-block-social-links s"><!-- wp:social-link {"url":"https://github.com","service":"github","className":"lnk"} /--><!-- wp:social-link {"url":"https://x.com","service":"x","className":"lnk"} /--></ul>\n<!-- /wp:social-links --><!-- wp:paragraph {"metadata":{"name":"team.name.1"}} -->\n<p>n</p>\n<!-- /wp:paragraph --></div>\n<!-- /wp:group -->'
  const map = {
    'team:style-1': {
      pattern: 'x/team',
      fields: { socials: { block: 'core/social-links', path: 'team.socials.<n>', attr: 'links', repeat: 'members' } }
    }
  }
  const { markup } = render(map, { 'x/team': pattern }, one('team', {}, [{ socials: 'linkedin|https://linkedin.com/in/a\nx|https://x.com/a' }]))
  assert.match(
    markup,
    /<ul class="wp-block-social-links s"><!-- wp:social-link \{"url":"https:\/\/linkedin.com\/in\/a","service":"linkedin","className":"lnk"\} \/--><!-- wp:social-link \{"url":"https:\/\/x.com\/a","service":"x","className":"lnk"\} \/--><\/ul>/
  )
  const empty = render(map, { 'x/team': pattern }, one('team', {}, [{ socials: '' }]))
  assert.doesNotMatch(empty.markup, /social-links/)
})

test('acmPattern / renderAcm: `layouts` picks the pattern by fields.layout; an unlisted value takes `*`, else the type\'s pattern', () => {
  const def = { pattern: 'x/ledger', layouts: { metrics: 'x/metrics', stats: 'x/stats' }, fields: {} }
  assert.equal(acmPattern(def, one('f', { layout: 'metrics' })), 'x/metrics')
  assert.equal(acmPattern(def, one('f', { layout: '' })), 'x/ledger')
  assert.equal(acmPattern({ ...def, layouts: { ...def.layouts, '*': 'x/stats' } }, one('f', { layout: '' })), 'x/stats')
  assert.equal(acmPattern({ pattern: 'x/only' }, one('f', { layout: 'metrics' })), 'x/only', 'no layouts: the pattern, whatever the field says')
  const patterns = { 'x/metrics': '<!-- wp:group {"className":"m"} -->\n<div class="wp-block-group m">x</div>\n<!-- /wp:group -->' }
  const { markup } = render({ 'f:style-1': def }, patterns, one('f', { layout: 'metrics' }))
  assert.match(markup, /class="wp-block-group m"/)
})

test('renderAcm: a map with an anchorConvention puts acm-<anchorSlug ?? type>-<id> on the root; a map without one does not', () => {
  const pattern = '<!-- wp:group {"tagName":"section","className":"acm-incident"} -->\n<section class="wp-block-group acm-incident">x</section>\n<!-- /wp:group -->'
  const types = { 'incident-timeline:style-1': { pattern: 'x/inc', anchorSlug: 'incident', fields: {} }, 'hero:style-1': { pattern: 'x/inc', fields: {} } }
  const run = (map, type) => renderAcm(one(type, {}, [], '180'), map, { 'x/inc': pattern }, media).markup
  const withConvention = { anchorConvention: 'acm-<type>-<id> on every root', types }
  assert.match(run(withConvention, 'incident-timeline'), /^<!-- wp:group \{"tagName":"section","className":"acm-incident","anchor":"acm-incident-180"\} -->\n<section class="wp-block-group acm-incident" id="acm-incident-180">/)
  assert.match(run(withConvention, 'hero'), /"anchor":"acm-hero-180"/)
  assert.doesNotMatch(run({ types }, 'hero'), /anchor|id=/)
})

test('renderAcm, className by field name: variant, align, tile-span, tile-icon, step_icon, icon replace their class family; popular marks the row', () => {
  const pattern = [
    '<!-- wp:group {"className":"cta cta-card","metadata":{"name":"cta"}} -->\n<div class="wp-block-group cta cta-card">',
    '<!-- wp:group {"className":"hx-ico-old node","metadata":{"name":"cta.icon.1"}} -->\n<div class="wp-block-group hx-ico-old node"></div>\n<!-- /wp:group -->',
    '<!-- wp:group {"className":"hx-ico-old node","metadata":{"name":"cta.icon.2"}} -->\n<div class="wp-block-group hx-ico-old node"></div>\n<!-- /wp:group -->',
    '</div>\n<!-- /wp:group -->'
  ].join('')
  const map = {
    'cta:style-1': {
      pattern: 'x/cta',
      fields: {
        variant: { block: 'core/group', path: 'cta', attr: 'className', repeat: null },
        icon: { block: 'core/group', path: 'cta.icon.<n>', attr: 'className', repeat: 'rows' }
      }
    }
  }
  const { markup, notes } = render(map, { 'x/cta': pattern }, one('cta', { variant: 'bar' }, [{ icon: 'zap' }, { icon: '' }]))
  assert.deepEqual(notes, [])
  assert.match(markup, /"className":"cta cta-bar"[^]*class="wp-block-group cta cta-bar"/)
  assert.match(markup, /"className":"node hx-ico-zap"/)
  assert.doesNotMatch(markup, /cta\.icon\.2/, 'an empty icon key draws no icon')

  const leaf = (name, cls) => `<!-- wp:group {"className":"${cls}","metadata":{"name":"${name}"}} -->\n<div class="wp-block-group ${cls}">x</div>\n<!-- /wp:group -->`
  const classes = (field, cls, value) => {
    const m = { 't:style-1': { pattern: 'x/t', fields: { [field]: { block: 'core/group', path: 't.x', attr: 'className', repeat: null } } } }
    return /"className":"([^"]*)"/.exec(render(m, { 'x/t': leaf('t.x', cls) }, one('t', { [field]: value })).markup)[1]
  }
  assert.equal(classes('align', 'head is-center', 'left'), 'head is-left')
  assert.equal(classes('tile-span', 'tile span-2', 'feat'), 'tile span-feat')
  assert.equal(classes('tile-icon', 'ico is-ico-activity', 'search'), 'ico is-ico-search')
  assert.equal(classes('step_icon', 'hx-ico-bell node', 'git'), 'node hx-ico-git')
  assert.equal(classes('variant', 'cta cta-card', ''), 'cta cta-card', 'an empty variant leaves the class as drawn')

  const tier = (n, extra = '') =>
    `<!-- wp:group {"className":"card${extra}","metadata":{"name":"pricing.item.${n}"}} -->\n<div class="wp-block-group card${extra}">` +
    `<!-- wp:paragraph {"metadata":{"name":"pricing.popular.${n}"}} -->\n<p>MOST POPULAR</p>\n<!-- /wp:paragraph -->` +
    `<!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button {"className":"hx-btn hx-btn--primary","metadata":{"name":"pricing.cta_label.${n}"}} --><div class="wp-block-button hx-btn hx-btn--primary"><a class="wp-block-button__link">Go</a></div><!-- /wp:button --></div><!-- /wp:buttons -->` +
    '</div>\n<!-- /wp:group -->'
  const pricing = `<!-- wp:group {"className":"acm-pricing"} -->\n<div class="wp-block-group acm-pricing">${tier(1, ' is-popular')}</div>\n<!-- /wp:group -->`
  const pmap = {
    'pricing:style-1': {
      pattern: 'x/p',
      item: 'pricing.item.<n>',
      fields: { popular: { block: 'core/group', path: 'pricing.item.<n>', attr: 'className', repeat: 'tiers' } }
    }
  }
  const out = render(pmap, { 'x/p': pricing }, one('pricing', {}, [{ popular: '0' }, { popular: '1' }])).markup
  assert.match(out, /"className":"card","metadata":\{"name":"pricing.item.1"\}/)
  assert.match(out, /"className":"card is-popular","metadata":\{"name":"pricing.item.2"\}/)
  assert.doesNotMatch(out, /pricing\.popular\.1/, 'the badge leaves the row that is not popular')
  assert.match(out, /pricing\.popular\.2/)
  assert.match(out, /"name":"pricing.cta_label.1"\}\} --><div class="wp-block-button hx-btn hx-btn--ghost">/)
  assert.match(out, /"name":"pricing.cta_label.2"\}\} --><div class="wp-block-button hx-btn hx-btn--primary">/)
})

test('renderAcm, attr url: a group card with no <a> carries the URL as its `url` attribute; a link block still gets href', () => {
  const pattern =
    '<!-- wp:group {"className":"grid"} -->\n<div class="wp-block-group grid"><!-- wp:group {"className":"card","url":"#","metadata":{"name":"clients.item.1"}} -->\n<div class="wp-block-group card"><!-- wp:paragraph {"metadata":{"name":"clients.item-name.1"}} -->\n<p>n</p>\n<!-- /wp:paragraph --></div>\n<!-- /wp:group --></div>\n<!-- /wp:group -->'
  const map = {
    'clients:style-2': {
      pattern: 'x/c',
      fields: { 'item-url': { block: 'core/group', path: 'clients.item.<n>', attr: 'url', repeat: 'items' } }
    }
  }
  const inst = { ...one('clients', {}, [{ 'item-url': 'https://example.com' }]), style: 'style-2' }
  const { markup } = render(map, { 'x/c': pattern }, inst)
  assert.match(markup, /\{"className":"card","url":"https:\/\/example.com","metadata":\{"name":"clients.item.1"\}\}/)
  assert.doesNotMatch(markup, /href/)
  const link = '<!-- wp:paragraph {"metadata":{"name":"l.a"}} -->\n<p><a href="#">x</a></p>\n<!-- /wp:paragraph -->'
  const lmap = { 'l:style-1': { pattern: 'x/l', fields: { u: { block: 'core/paragraph', path: 'l.a', attr: 'url', repeat: null } } } }
  assert.match(render(lmap, { 'x/l': link }, one('l', { u: '/go' })).markup, /<a href="\/go">x<\/a>/)
  const social = '<!-- wp:social-link {"url":"#","service":"github","metadata":{"name":"s.link"}} /-->'
  const smap = { 's:style-1': { pattern: 'x/s', fields: { url: { block: 'core/social-link', path: 's.link', attr: 'url', repeat: null } } } }
  assert.match(render(smap, { 'x/s': social }, one('s', { url: 'https://example.com/profile' })).markup, /"url":"https:\/\/example.com\/profile"/)
})

test('renderAcm, className columns: a pattern that draws hx-cols-<n> takes the value in that family, and no Tracy Base class', () => {
  const pattern =
    '<!-- wp:group {"className":"acm-fi"} -->\n<div class="wp-block-group acm-fi"><!-- wp:group {"className":"hx-cols hx-fi-grid hx-cols-3","metadata":{"name":"fi.columns"}} -->\n<div class="wp-block-group hx-cols hx-fi-grid hx-cols-3"><!-- wp:paragraph -->\n<p>x</p>\n<!-- /wp:paragraph --></div>\n<!-- /wp:group --></div>\n<!-- /wp:group -->'
  const map = { 'fi:style-1': { pattern: 'x/fi', fields: { columns: { block: 'core/group', path: 'fi.columns', attr: 'className', repeat: null } } } }
  const { markup, notes } = render(map, { 'x/fi': pattern }, one('fi', { columns: '2' }))
  assert.deepEqual(notes, [])
  assert.match(markup, /"className":"hx-cols hx-fi-grid hx-cols-2"[^]*class="wp-block-group hx-cols hx-fi-grid hx-cols-2"/)
  assert.doesNotMatch(markup, /--cols-|grid-cols/)
  assert.match(render(map, { 'x/fi': pattern }, one('fi', { columns: '' })).markup, /hx-cols-3/, 'an empty value keeps the drawn count')
})

test('renderAcm: a container the pattern draws empty stays; one the fill empties goes', () => {
  const pattern = [
    '<!-- wp:group {"className":"acm-t"} -->\n<div class="wp-block-group acm-t">',
    '<!-- wp:group {"className":"hx-sec-rule"} -->\n<div class="wp-block-group hx-sec-rule"></div>\n<!-- /wp:group -->',
    '<!-- wp:group {"className":"head"} -->\n<div class="wp-block-group head"><!-- wp:paragraph {"metadata":{"name":"t.eyebrow"}} -->\n<p>e</p>\n<!-- /wp:paragraph --></div>\n<!-- /wp:group -->',
    '<!-- wp:paragraph {"metadata":{"name":"t.title"}} -->\n<p>t</p>\n<!-- /wp:paragraph -->',
    '</div>\n<!-- /wp:group -->'
  ].join('')
  const map = {
    't:style-1': {
      pattern: 'x/t',
      fields: {
        eyebrow: { block: 'core/paragraph', path: 't.eyebrow', attr: 'content', repeat: null },
        title: { block: 'core/paragraph', path: 't.title', attr: 'content', repeat: null }
      }
    }
  }
  const { markup } = render(map, { 'x/t': pattern }, one('t', { eyebrow: '', title: 'Hello' }))
  assert.match(markup, /<div class="wp-block-group hx-sec-rule"><\/div>/, 'the rule the pattern draws empty is kept')
  assert.doesNotMatch(markup, /class="wp-block-group head"/, 'the head the empty eyebrow emptied is pruned')
})

test('buildPageContent: a view the map names draws its block after the named position, and nothing of Contact Form 7', () => {
  const pattern = (id) => `<!-- wp:group {"className":"s${id}"} -->\n<div class="wp-block-group s${id}">x</div>\n<!-- /wp:group -->`
  const map = { types: { 'm:style-1': { pattern: 'x/m', fields: {} } }, views: { 'page-contact': { block: 'x/contact-form', after: 'page-top' } } }
  const inst = (id, position) => ({ id, type: 'm', style: 'style-1', position, published: true, ordering: 1, scope: 'page', pages: [{ wpPath: '/contact' }], fields: {}, items: [] })
  const ctx = {
    spec: { sections: { acm: [inst('1', 'page-top'), inst('2', 'page-bottom')], custom: [] } },
    patternsMap: map,
    patterns: { 'x/m': pattern('') },
    media,
    rewrite: (m) => m,
    cf7: null,
    log: [],
    sections: [],
    terms: new Map()
  }
  const page = {
    path: '/contact',
    view: 'page-contact',
    contentKind: 'blocks',
    content: '<!-- wp:tracy-base/slot {"position":"page-top"} /-->\n<!-- wp:tracy-base/slot {"position":"page-bottom"} /-->'
  }
  const out = buildPageContent(page, ctx)
  assert.equal(checkMarkup(out), true)
  const form = out.indexOf('<!-- wp:x/contact-form /-->')
  const groups = [...out.matchAll(/<!-- wp:group /g)].map((m) => m.index)
  assert.ok(groups[0] < form && form < groups[1], 'between the page-top and page-bottom sections')
  assert.doesNotMatch(out, /contact-form-7/)
  assert.deepEqual(ctx.log, [])
  const elsewhere = buildPageContent({ ...page, path: '/about', view: 'page' }, { ...ctx, log: [], sections: [] })
  assert.doesNotMatch(elsewhere, /x\/contact-form/, 'another view does not take it')
})
