/**
 * A records write never removes or reshapes a node a contract slot binds to (spec TracyHQ/tracy#189). A brief build that
 * emptied a stat sentence by deleting its words left the plugin's inspect with no node for the slots' paths ("HTML slot is
 * missing or ambiguous"), and every contract write after it was refused. The guard: after the records steps, every slot's
 * path still finds exactly one node, as the plugin's `DOMXPath` would. The businesses and demos are made up.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parse } from 'parse5'

import { recordSteps } from '../src/sites/brief-engines/joomla-plan-records.js'

/**
 * The nodes an absolute content-map path finds in a field's HTML: element steps (`div`, `span[2]`), `text()`, `text()[n]`
 * and `@attr`, the grammar the content maps use.
 * @param {string} html @param {string} xpath
 */
function resolve(html, xpath) {
  let nodes = [parse(`<!doctype html><html><head></head><body>${html}</body></html>`)]
  for (const step of xpath.split('/').filter(Boolean)) {
    const [, name, nth] = /^([^[]+)(?:\[(\d+)\])?$/.exec(step) ?? []
    nodes = nodes.flatMap((node) => {
      let found
      if (name.startsWith('@')) found = (node.attrs ?? []).filter((a) => a.name === name.slice(1))
      else if (name === 'text()') found = (node.childNodes ?? []).filter((c) => c.nodeName === '#text')
      else found = (node.childNodes ?? []).filter((c) => c.tagName === name)
      return nth ? found.slice(Number(nth) - 1, Number(nth)) : found
    })
  }
  return nodes
}

const statSlots = (entity, words, path, column = 'params') =>
  words.map((sample, i) => ({
    key: `${entity}.${i}`,
    entity,
    column,
    type: 'text',
    role: ['stat.context', 'stat.value', 'stat.label'][i],
    sample,
    ...(column === 'params' ? { jsonPath: ['top-desc'] } : {}),
    xpath: path[i]
  }))

test('#189 after the records steps every bound slot of an emptied stat still finds exactly one node', () => {
  // A bakery module: "Trusted by <span>500</span> local families" beside a proof picture.
  const bakeryHtml =
    '<div class="stat"><img src="images/demo/face-1.png" alt=""><div>Trusted by <span>500</span> local families</div></div>'
  const bakery = [
    ...statSlots(
      'module-31',
      ['Trusted by ', '500', ' local families'],
      ['/html/body/div/div/text()[1]', '/html/body/div/div/span/text()', '/html/body/div/div/text()[2]']
    ),
    {
      key: 'module-31.3',
      entity: 'module-31',
      column: 'params',
      type: 'image',
      sample: 'images/demo/face-1.png',
      jsonPath: ['top-desc'],
      xpath: '/html/body/div/img/@src'
    }
  ]
  // A law firm's article: "Over <strong>30</strong> cases won" in its intro text.
  const lawHtml = '<p>Over <strong>30</strong> cases won</p>'
  const law = statSlots(
    'article-44',
    ['Over ', '30', ' cases won'],
    ['/html/body/p/text()[1]', '/html/body/p/strong/text()', '/html/body/p/text()[2]'],
    'introtext'
  )
  const slots = [...bakery, ...law]
  for (const slot of bakery) assert.equal(resolve(bakeryHtml, slot.xpath).length, 1, `${slot.key} before`)
  for (const slot of law) assert.equal(resolve(lawHtml, slot.xpath).length, 1, `${slot.key} before`)

  const { steps } = recordSteps({
    honesty: { blanks: slots },
    modules: new Map([[31, { id: 31, params: JSON.stringify({ 'top-desc': bakeryHtml }) }]]),
    articles: new Map([[44, { id: 44, introtext: lawHtml }]])
  })
  const bakeryAfter = JSON.parse(steps.find((s) => s.kind === 'module').fields.params)['top-desc']
  const lawAfter = steps.find((s) => s.kind === 'article').fields.introtext
  for (const slot of bakery) assert.equal(resolve(bakeryAfter, slot.xpath).length, 1, `${slot.key} after`)
  for (const slot of law) assert.equal(resolve(lawAfter, slot.xpath).length, 1, `${slot.key} after`)
  // The visitor reads none of the demo's words, and the proof picture is hidden in place.
  assert.doesNotMatch(bakeryAfter + lawAfter, /Trusted|500|families|Over|30|cases/)
  assert.match(bakeryAfter, /<img hidden src="images\/demo\/face-1\.png"/)
})

test('#189 an emptied markup sample keeps every element it had', () => {
  const html = '<div><p>Our coaches <em>train</em> you.</p><ul><li>Warm up</li><li>Cool down</li></ul></div>'
  const slot = {
    key: 'module-5.1',
    entity: 'module-5',
    column: 'params',
    type: 'text',
    sample:
      '((p))Our coaches ((em))train((/em)) you.((/p))((ul))((li))Warm up((/li))((li))Cool down((/li))((/ul))',
    jsonPath: ['top-desc'],
    xpath: '/html/body/div'
  }
  const { steps } = recordSteps({
    honesty: { blanks: [slot] },
    modules: new Map([[5, { id: 5, params: JSON.stringify({ 'top-desc': html }) }]])
  })
  const after = JSON.parse(steps[0].fields.params)['top-desc']
  assert.equal(after, '<div><p>&nbsp;<em>&nbsp;</em>&nbsp;</p><ul><li>&nbsp;</li><li>&nbsp;</li></ul></div>')
  for (const path of ['/html/body/div', '/html/body/div/p/em', '/html/body/div/ul/li[2]'])
    assert.equal(resolve(after, path).length, 1, path)
})

test('#189 a records step that would take a bound node away is held, whatever planner made it', async () => {
  const { keepBoundNodes, nodesAt } = await import('../src/sites/brief-engines/joomla-bound-nodes.js')
  // A florist's stat module: a step that deletes the words (as the old emptying did) and one that keeps every node.
  const html = '<div><div>Over <span>200</span> weddings</div></div>'
  const slots = ['Over ', '200', ' weddings'].map((sample, i) => ({
    key: `module-12.${i}`,
    entity: 'module-12',
    column: 'params',
    jsonPath: ['top-desc'],
    sample,
    xpath: ['/html/body/div/div/text()[1]', '/html/body/div/div/span/text()', '/html/body/div/div/text()[2]'][
      i
    ]
  }))
  const row = { id: 12, params: JSON.stringify({ 'top-desc': html }) }
  const deletes = {
    kind: 'module',
    id: 12,
    fields: { params: JSON.stringify({ 'top-desc': '<div><div><span></span></div></div>' }) }
  }
  const keeps = {
    kind: 'module',
    id: 12,
    fields: {
      params: JSON.stringify({ 'top-desc': '<div><div>&nbsp;<span>&nbsp;</span>&nbsp;</div></div>' })
    }
  }
  const other = { kind: 'menuItem', id: 3, fields: { published: 0 } }
  const out = keepBoundNodes({ steps: [deletes, keeps, other], slots, modules: new Map([[12, row]]) })
  assert.deepEqual(out.steps, [keeps, other])
  assert.deepEqual(out.dropped, [
    { kind: 'module', id: 12, keys: ['module-12.0', 'module-12.1', 'module-12.2'] }
  ])
  assert.equal(nodesAt(html, '/html/body/div/div/a/@href'), 0)
  assert.equal(nodesAt(html, '//div'), null, 'a path outside the grammar is not judged')
})

test('#189 a fact line in a custom module, a contact line and a contact note are emptied through their own records', () => {
  // A florist's custom module with an opening-hours line, and a dental clinic's demo contact address and note.
  const hours = {
    key: 'module-40.1',
    entity: 'module-40',
    column: 'content',
    type: 'text',
    role: 'business.hours',
    sample: 'Open daily 8am to 6pm',
    xpath: '/html/body/p/strong/text()'
  }
  const address = {
    key: 'contact-3.1',
    entity: 'contact-3',
    column: 'address',
    type: 'text',
    sample: '12 Demo Road'
  }
  const note = {
    key: 'contact-3.4',
    entity: 'contact-3',
    column: 'misc',
    type: 'text',
    sample: 'Our friendly staff will help.',
    xpath: '/html/body/p/text()'
  }
  const moduleHtml = '<p>Hours: <strong>Open daily 8am to 6pm</strong></p>'
  const made = recordSteps({
    honesty: {
      blanks: [
        hours,
        address,
        note,
        { key: 'article-9.0', entity: 'article-9', column: 'title', sample: 'Demo' }
      ]
    },
    modules: new Map([[40, { id: 40, params: '{}', content: moduleHtml }]]),
    contacts: new Map([[3, { id: 3, address: '12 Demo Road', misc: '<p>Our friendly staff will help.</p>' }]])
  })
  const content = made.steps.find((s) => s.kind === 'module').fields.content
  assert.equal(content, '<p>Hours: <strong>&nbsp;</strong></p>')
  assert.equal(nodesAtLocal(content, hours.xpath), 1)
  const contact = made.steps.filter((s) => s.kind === 'contact').map((s) => s.fields)
  assert.deepEqual(contact, [{ address: '' }, { misc: '<p>&nbsp;</p>' }])
  // A title no records door empties is named, not counted silently.
  assert.equal(made.unresolved, 1)
  assert.deepEqual(made.left, ['article-9.0'])
})

test('#189 a step that takes an item out of a bound JSON list is held; emptying it in place passes', async () => {
  const { keepBoundNodes } = await import('../src/sites/brief-engines/joomla-bound-nodes.js')
  // A yoga studio's class list (ACM-style arrays), three classes, the contract bound to each title.
  const config = { classes: { 'classes[title]': ['Flow', 'Yin', 'Power'] } }
  const row = { id: 7, params: JSON.stringify({ 'jatools-config': JSON.stringify(config) }) }
  const slots = [0, 1, 2].map((i) => ({
    key: `module-7.${i}`,
    entity: 'module-7',
    column: 'params',
    nestedJson: 'jatools-config',
    jsonPath: ['classes', 'classes[title]', i]
  }))
  const write = (titles) => ({
    kind: 'module',
    id: 7,
    fields: {
      params: JSON.stringify({ 'jatools-config': JSON.stringify({ classes: { 'classes[title]': titles } }) })
    }
  })
  const spliced = write(['Flow', 'Yin'])
  const emptied = write(['Flow', 'Yin', ''])
  const out = keepBoundNodes({ steps: [spliced, emptied], slots, modules: new Map([[7, row]]) })
  assert.deepEqual(out.steps, [emptied])
  assert.deepEqual(out.dropped, [{ kind: 'module', id: 7, keys: ['module-7.2'] }])
})

/** The resolver above, by its own name for the tests after it. */
const nodesAtLocal = (html, xpath) => resolve(html, xpath).length
