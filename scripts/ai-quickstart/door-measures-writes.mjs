/**
 * `door-measures.mjs` part B: a replayed request id (`content.contract` apply) and a reused apply id
 * (`content.update`), the plugin's HTML piece functions on stored and crafted values, and records written with no
 * title or name.
 */
import { wordsCopy } from './door-measures-hide.mjs'
import { K } from './door-measures-lib.mjs'

export async function measureWrites(ctx) {
  await replay(ctx)
  await htmlPieces(ctx)
  await titles(ctx)
}

/** B4. The same request id twice: with the same changes, then with other changes; and an apply id reused. */
async function replay(ctx) {
  const { door, fact } = ctx
  const state = await ctx.inspect()
  const slot = state.slots.find(
    (s) => s.opensEmpty && s.type === 'text' && s.current === '' && !/[<>]/.test(s.sample)
  )
  const read = async () => {
    const now = await ctx.inspect()
    return { revision: now.revision, current: now.slots.find((s) => s.key === slot.key)?.current }
  }
  const apply = (apply_id, request_id, expected_revision, words) =>
    door.call('content.contract', {
      operation: 'apply',
      apply_id,
      request_id,
      expected_revision,
      changes: { [slot.key]: words },
      evidence: { [slot.key]: 'invented: a measurement value' }
    })
  const a = door.applyId('contract-measure')
  const b = door.applyId('contract-measure')
  const r = door.applyId('req')
  const steps = []
  const run = async (name, ...args) => {
    const answer = await apply(...args)
    steps.push({
      name,
      sent: { apply_id: args[0], request_id: args[1], words: args[3] },
      answer,
      after: await read()
    })
  }
  await run('first apply', a, r, state.revision, 'Measure Alpha')
  const moved = (await read()).revision
  await run(
    'same apply id, same request id, same changes, revision read before the first apply',
    a,
    r,
    state.revision,
    'Measure Alpha'
  )
  await run(
    'same apply id, same request id, same changes, the current revision',
    a,
    r,
    moved,
    'Measure Alpha'
  )
  await run('same apply id, same request id, other changes', a, r, moved, 'Measure Beta')
  await run('same apply id, a new request id, other changes', a, door.applyId('req'), moved, 'Measure Beta')
  await run('a new apply id, the same request id, other changes', b, r, moved, 'Measure Beta')
  fact('B4 request id replay (content.contract apply)', { slot: slot.key, start: slot.current, steps })

  // content.update has no request id: the same apply id twice, with the same and then other fields.
  const id = await wordsCopy(ctx, 'Measure Replay Words', null)
  const apply_id = door.applyId('update')
  const sent = []
  for (const title of ['Measure Update One', 'Measure Update One', 'Measure Update Two']) {
    const answer = await door.update('module', id, { title }, apply_id)
    sent.push({ title, answer, readBack: (await door.get('module', id))?.title })
  }
  const log = await door.call('apply.list', { apply_id })
  fact('B4 apply id reused (content.update)', { module: id, apply_id, sent, applyList: log })
}

/** B5. Set one text node with the plugin's functions; also set it to its own text (must give back the same bytes). */
async function htmlPieces(ctx) {
  const { door, fact, lib } = ctx
  const config = async (id) => JSON.parse(JSON.parse((await door.get('module', id)).params)['jatools-config'])
  const c167 = await config(167)
  const c163 = await config(163)
  const stored = [
    {
      from: 'module-175 content',
      value: (await door.get('module', 175)).content,
      xpath: '/html/body/div/a[1]/text()'
    },
    {
      from: 'module-176 content',
      value: (await door.get('module', 176)).content,
      xpath: '/html/body/div/a/text()'
    },
    {
      from: 'module-170 content',
      value: (await door.get('module', 170)).content,
      xpath: '/html/body/div/a/img/@src'
    },
    {
      from: 'module-167 item-info row 0 (markers)',
      value: c167['features-intro']['features-intro[item-info]'][0],
      xpath: '/html/body/div/ul/li[2]'
    },
    {
      from: 'module-163 team-info row 0 (markers)',
      value: c163.teams['teams-intro[data]']['teams-intro[data][team-info]'][0],
      xpath: '/html/body/div/div/a[2]/@href'
    }
  ]
  const crafted = [
    {
      from: 'entities and siblings',
      value:
        // language-allow: sample page text with an accented letter, sent to the door as measured data
        '<p class="a" id="b">Fish &amp; Chips&nbsp;to go &#169; &#x263A; &eacute; café</p><p>Second <b>bold</b> tail &lt;x&gt;</p>',
      xpath: '/html/body/div/p[2]/text()[1]'
    },
    {
      from: 'entities in the edited node',
      value: '<p>Fish &amp; Chips&nbsp;to go &#169;</p><p>other &amp; more</p>',
      xpath: '/html/body/div/p[1]/text()'
    },
    {
      from: 'unclosed li',
      value: '<ul><li>one<li>two<li>three</ul>',
      xpath: '/html/body/div/ul/li[2]/text()'
    },
    {
      from: 'unclosed p before a block',
      value: '<p>open para<div>block</div><p>next',
      xpath: '/html/body/div/div/text()'
    },
    {
      from: 'attribute order and quoting',
      value: `<a title="t" href="h" class="c" data-x='y' download>link</a> <img src=x alt="a"><br/><br>`,
      xpath: '/html/body/div/a/text()'
    },
    {
      from: 'comment and white space',
      value: '<!-- note -->\r\n<p>  spaced  </p>\n\t<p>b</p>',
      xpath: '/html/body/div/p[2]/text()'
    }
  ]
  const results = []
  for (const c of [...stored, ...crafted]) {
    try {
      const [readBefore] = K.pieces(lib, [{ value: c.value, xpath: c.xpath }])
      const [same] = K.pieces(lib, [{ value: c.value, xpath: c.xpath, set: readBefore.text }])
      const [edited] = K.pieces(lib, [{ value: c.value, xpath: c.xpath, set: 'Measure New Words' }])
      results.push({
        from: c.from,
        xpath: c.xpath,
        stored: c.value,
        pieceText: readBefore.text,
        setToItsOwnText: { value: same.value, identical: same.value === c.value },
        setToNewWords: { value: edited.value, ...rest(c.value, edited.value) }
      })
    } catch (error) {
      results.push({
        from: c.from,
        xpath: c.xpath,
        stored: c.value,
        error: String(error.message).slice(0, 300)
      })
    }
  }
  fact('B5 HTML piece functions (html-piece.php, the plugin lib)', { results })
}

/** The bytes before and after the first and last difference: what an edit kept around the node it changed. */
function rest(before, after) {
  let start = 0
  while (start < before.length && before[start] === after[start]) start++
  let end = 0
  while (end < before.length - start && before.at(-1 - end) === after.at(-1 - end)) end++
  return { keptPrefix: start, keptSuffix: end, changedFrom: before.slice(start, before.length - end) }
}

/** B6. Create an article, a category, a contact and a module with no title or name, and with an empty one. */
async function titles(ctx) {
  const { door, fact } = ctx
  const base = {
    article: {
      alias: ctx.alias('t'),
      catid: ctx.category,
      state: 1,
      language: '*',
      access: 1,
      introtext: '<p>x</p>'
    },
    category: { alias: ctx.alias('t'), extension: 'com_content', published: 1, language: '*', access: 1 },
    contact: {
      catid: ctx.contactCategory,
      published: 1,
      language: '*',
      access: 1,
      params: '{}',
      metadata: '{}',
      metadesc: ''
    },
    module: {
      module: 'mod_custom',
      position: 'section-1',
      content: '<p>x</p>',
      published: 1,
      language: '*',
      access: 1,
      params: '{}'
    }
  }
  const key = { article: 'title', category: 'title', contact: 'name', module: 'title' }
  const results = []
  for (const kind of Object.keys(base)) {
    for (const words of [undefined, '', ' ']) {
      const fields = {
        ...base[kind],
        alias: ctx.alias('t'),
        ...(words === undefined ? {} : { [key[kind]]: words })
      }
      if (kind === 'module') delete fields.alias
      const answer = await door.update(kind, 0, fields)
      const made = answer.ok ? await door.get(kind, answer.id) : null
      results.push({
        kind,
        [key[kind]]: words === undefined ? '(missing)' : JSON.stringify(words),
        answer,
        stored: made ? { [key[kind]]: made[key[kind]], alias: made.alias } : null
      })
      if (answer.ok) await door.call('content.delete', { apply_id: door.applyId('del'), kind, id: answer.id })
    }
  }
  fact('B6 records with no title or name (content.update create)', { results })
}
