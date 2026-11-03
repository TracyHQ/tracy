import { arr, obj } from './rule-set.js'

// R00 Output shape: report every field the spec's Output shape does not have
export function checkR00(ctx) {
  const { R, plan } = ctx
  const r = R.r0
  const BD = [
    'block',
    'seen',
    'decision',
    'why',
    'message',
    'copy',
    'lists',
    'pictures',
    'links',
    'hiddenSlots'
  ]
  const SHAPE = {
    $: [
      'version',
      'kit',
      'brief',
      'site',
      'pageGroups',
      'mainMenu',
      'sharedBlocks',
      'pages',
      'ownerTasks',
      'kitGaps'
    ],
    'kitGaps[]': ['page', 'block', 'seen', 'why'],
    site: [
      'voice',
      'audience',
      'primaryAction',
      'contactChannels',
      'forbidden',
      'language',
      'footerMenu',
      'legalPages',
      'notFound',
      'forms'
    ],
    'site.forms[]': ['block', 'decision', 'why'],
    'site.voice': ['summary', 'ownWords', 'avoid'],
    'site.primaryAction': ['intent', 'leadsTo', 'factIds'],
    'site.contactChannels[]': ['kind', 'factId'],
    'site.forbidden[]': ['what', 'why'],
    'site.footerMenu[]': ['group', 'heading', 'pages'],
    'site.footerMenu[].heading': ['says', 'page'],
    'site.legalPages[]': ['kind', 'use', 'id', 'slug', 'says', 'factIds'],
    'site.notFound': ['says', 'leadsTo'],
    'pageGroups[]': ['id', 'decision', 'slug', 'why'],
    'mainMenu[]': ['page', 'intent', 'children'],
    'mainMenu[].children[]': ['page', 'intent'],
    'pages[]': [
      'id',
      'decision',
      'why',
      'slug',
      'visitorQuestion',
      'keyMessage',
      'story',
      'endAction',
      'seo',
      'blocks'
    ],
    'pages[].story[]': ['block', 'step'],
    'pages[].endAction': ['intent', 'leadsTo'],
    'pages[].seo': ['titleIntent', 'descriptionIntent', 'searchTerms'],
    'ownerTasks[]': ['what', 'why', 'unblocks', 'about'],
    BLOCK: BD,
    'BLOCK.copy[]': ['slot', 'says', 'text', 'factIds', 'basis', 'maxCharacters'],
    'BLOCK.lists[]': ['list', 'rows', 'items'],
    'BLOCK.lists[].items[]': ['about', 'angle', 'copy', 'proof', 'pictures'],
    'BLOCK.lists[].items[].copy[]': ['slot', 'says', 'text', 'factIds', 'basis', 'maxCharacters'],
    'BLOCK.lists[].items[].proof': ['factIds', 'how'],
    'BLOCK.pictures[]': [
      'frame',
      'kind',
      'match',
      'size',
      'shows',
      'mustInclude',
      'avoid',
      'mood',
      'factIds',
      'person',
      'sameAs'
    ],
    'BLOCK.lists[].items[].pictures[]': [
      'frame',
      'kind',
      'match',
      'size',
      'shows',
      'mustInclude',
      'avoid',
      'mood',
      'factIds',
      'person',
      'sameAs'
    ],
    // Links name their label slot; the label's words live only in that slot's text.
    'BLOCK.links[]': ['link', 'labelSlot', 'leadsTo'],
    'BLOCK.hiddenSlots[]': ['slot', 'why']
  }
  const extra = new Map() // "path.field" -> [places]
  const check = (node, shapePath, where) => {
    const allowed = SHAPE[shapePath]
    if (!allowed || !node || typeof node !== 'object' || Array.isArray(node)) return
    for (const k of Object.keys(node))
      if (!allowed.includes(k)) {
        const key = `${shapePath.replace(/^BLOCK/, 'block decision')}.${k}`
        extra.set(key, [...(extra.get(key) || []), where])
      }
  }
  const each = (list, fn) => arr(list).forEach(fn)
  check(plan, '$', 'plan')
  const site = obj(plan.site)
  check(site, 'site', 'site')
  check(site.voice, 'site.voice', 'site.voice')
  check(site.primaryAction, 'site.primaryAction', 'site.primaryAction')
  each(site.contactChannels, (c, i) => check(c, 'site.contactChannels[]', `site.contactChannels[${i}]`))
  each(site.forbidden, (c, i) => check(c, 'site.forbidden[]', `site.forbidden[${i}]`))
  each(site.footerMenu, (c, i) => {
    check(c, 'site.footerMenu[]', `site.footerMenu[${i}]`)
    check(obj(c).heading, 'site.footerMenu[].heading', `site.footerMenu[${i}].heading`)
  })
  each(site.legalPages, (c, i) => check(c, 'site.legalPages[]', `site.legalPages[${i}]`))
  each(site.forms, (c, i) => check(c, 'site.forms[]', `site.forms[${i}]`))
  each(plan.kitGaps, (c, i) => check(c, 'kitGaps[]', `kitGaps[${i}]`))
  check(site.notFound, 'site.notFound', 'site.notFound')
  each(plan.pageGroups, (g) => check(g, 'pageGroups[]', `pageGroups ${g.id}`))
  each(plan.mainMenu, (m, i) => {
    check(m, 'mainMenu[]', `mainMenu[${i}]`)
    each(obj(m).children, (c, j) => check(c, 'mainMenu[].children[]', `mainMenu[${i}].children[${j}]`))
  })
  each(plan.ownerTasks, (t, i) => check(t, 'ownerTasks[]', `ownerTasks[${i}]`))
  each(plan.pages, (p) => {
    check(p, 'pages[]', `pages ${p.id}`)
    check(p.endAction, 'pages[].endAction', `pages ${p.id}`)
    check(p.seo, 'pages[].seo', `pages ${p.id}`)
    each(p.story, (s) => check(s, 'pages[].story[]', `pages ${p.id}`))
  })
  ;[
    ...arr(plan.sharedBlocks).map((d) => [d, 'sharedBlocks']),
    ...arr(plan.pages).flatMap((p) => arr(p.blocks).map((d) => [d, `pages ${p.id}`]))
  ].forEach(([d, where]) => {
    if (typeof d === 'string') return
    const w = `${where} / block ${obj(d).block}`
    check(d, 'BLOCK', w)
    each(d.copy, (c) => check(c, 'BLOCK.copy[]', w))
    each(d.pictures, (c) => check(c, 'BLOCK.pictures[]', w))
    each(d.links, (c) => check(c, 'BLOCK.links[]', w))
    each(d.hiddenSlots, (c) => check(c, 'BLOCK.hiddenSlots[]', w))
    each(d.lists, (l) => {
      check(l, 'BLOCK.lists[]', w)
      each(l.items, (it) => {
        check(it, 'BLOCK.lists[].items[]', w)
        each(obj(it).copy, (c) => check(c, 'BLOCK.lists[].items[].copy[]', w))
        check(obj(it).proof, 'BLOCK.lists[].items[].proof', w)
        each(obj(it).pictures, (c) => check(c, 'BLOCK.lists[].items[].pictures[]', w))
      })
    })
  })
  if (!extra.size) r.ok()
  for (const [key, places] of extra) {
    const sample = [...new Set(places)].slice(0, 4).join('; ')
    r.fail(
      key,
      `field not in the spec's Output shape, used ${places.length} time(s), e.g. ${sample}`,
      'prompt'
    )
  }
  r.note(
    'cause "prompt": the planner needed something the Output shape has no field for (drop a single page; say what a created Privacy page holds) or added a harmless extra; either way the spec should say how to do it'
  )
}
