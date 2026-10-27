/**
 * REG-044: the thread card of a comment Tracy resolved titles its Resolved pill "Tracy marked this
 * done"; a person's resolve still reads "Resolved by <name>".
 *
 * Writes, all on the stand's WordPress test site: two comments (C, H) and one request, cleared at
 * the end; one post's title written back unchanged through the apply door. The post and its title
 * are read from the site's own database, read only.
 */
import { spawnSync } from 'node:child_process'
import { api, expect, ORIGIN, STAND_NAME, seatContext, seatEmail, siteKey, test } from './stand.mjs'

const S = siteKey('wp')
/** The site's page origin as its comments carry it: the site's host on the stand's port. */
const P = (() => {
  const o = new URL(ORIGIN)
  return `${o.protocol}//${S}${o.port ? `:${o.port}` : ''}`
})()

/**
 * The first published post of the site, from its database (SELECT only).
 * @returns {{id: number, title: string}} PID and T.
 */
function firstPublishedPost() {
  const db = `${STAND_NAME}wp-db-1`
  const sql = (q) => {
    const r = spawnSync(
      'docker',
      [
        'exec',
        db,
        'sh',
        '-c',
        'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -N -B -r "$MARIADB_DATABASE" -e "$0"',
        q
      ],
      { encoding: 'utf8' }
    )
    if (r.status !== 0) throw new Error(`site database read failed: ${r.stderr}`)
    return r.stdout.trim()
  }
  const posts = sql("SHOW TABLES LIKE '%\\_posts'").split('\n')[0]
  const row = sql(
    `SELECT JSON_OBJECT('id', ID, 'title', post_title) FROM \`${posts}\` WHERE post_type = 'post' AND post_status = 'publish' ORDER BY ID LIMIT 1`
  )
  return JSON.parse(row)
}

/**
 * Open the site's browser card on a comment's thread and read its Resolved pill.
 * @param {import('@playwright/test').BrowserContext} context - the seat's context.
 * @param {string} id - comment id.
 * @returns {Promise<{title: string | null, text: string}>} the pill.
 */
async function readPill(context, id) {
  const page = await context.newPage()
  await page.goto(`${ORIGIN}/${S}/?open=browser&page=/&mode=edit&comment=${id}`)
  const pill = page.locator(`[data-thread="${id}"] [data-resolved-pill]`)
  await pill.waitFor({ timeout: 90_000 })
  return { title: await pill.getAttribute('title'), text: (await pill.innerText()).trim() }
}

test('REG-044 resolved pill names who resolved', async ({ browser }) => {
  const ms = Date.now()
  const ids = []
  try {
    // S0
    const { id: PID, title: T } = firstPublishedPost()
    console.log(`S0: S = ${S}, P = ${P}, PID = ${PID}`)

    // S1: comment C and a request carrying it.
    const c = await api('a', 'POST', `/api/sites/${S}/comments`, {
      text: '[REG-044] tracy',
      url: `${P}/`,
      element: null
    })
    const C = c.json?.comment?.id
    expect(C, `comment C created (HTTP ${c.status})`).toBeTruthy()
    ids.push(C)
    const req = await api('a', 'POST', `/api/sites/${S}/requests`, {
      sessionId: `reg044-${ms}`,
      requestId: `r-${ms}`,
      items: [{ url: `${P}/`, element: null, text: '', commentId: C }]
    })
    const N = req.json?.requests?.[0]?.n
    expect(N, `request N created (HTTP ${req.status})`).toBeTruthy()

    // S2: the title written back unchanged, naming request N.
    const apply = await api('a', 'POST', `/api/sites/${S}/apply`, {
      action: 'content.update',
      params: { kind: 'post', id: PID, fields: { post_title: T }, apply_id: `reg044-${ms}` },
      comment: N
    })
    console.log(`S2: apply HTTP ${apply.status}, ok = ${String(apply.json?.ok)}`)
    expect.soft(apply.json?.ok, 'S2: apply answers ok:true').toBe(true)
    const rowC = (await api('a', 'GET', `/api/sites/${S}/comments`)).json?.comments?.find((r) => r.id === C)
    console.log(`S2: row C status = ${rowC?.status}, resolvedByTracy = ${String(rowC?.resolvedByTracy)}`)
    expect.soft(rowC?.status, 'S2: row C status').toBe('resolved')
    expect.soft(rowC?.resolvedByTracy, 'S2: row C resolvedByTracy').toBe(true)

    // S3: comment H, resolved by the person.
    const h = await api('a', 'POST', `/api/sites/${S}/comments`, {
      text: '[REG-044] person',
      url: `${P}/`,
      element: null
    })
    const H = h.json?.comment?.id
    expect(H, `comment H created (HTTP ${h.status})`).toBeTruthy()
    ids.push(H)
    const resolved = await api('a', 'POST', `/api/sites/${S}/comments/${H}/resolve`)
    expect(resolved.status, 'S3: H resolved').toBe(200)
    // Seat a's name: the resolver the server records for H must be seat a; a person without a
    // display name is named by the local part of their address (REG-057's fence).
    const rowH = (await api('a', 'GET', `/api/sites/${S}/comments`)).json?.comments?.find((r) => r.id === H)
    const by = rowH?.resolvedBy
    console.log(
      `S3: H resolvedBy = ${String(by?.email)} (name ${String(by?.name)}), resolvedByTracy = ${String(rowH?.resolvedByTracy)}`
    )
    expect(by?.email, 'H was resolved by seat a').toBe(seatEmail('a'))
    const name = by.name || by.email.split('@')[0]

    // S4: seat a in English.
    const en = await seatContext(browser, 'a', { locale: 'en-US' })
    const pillC = await readPill(en, C)
    const pillH = await readPill(en, H)
    console.log(`S4 en: C pill text = '${pillC.text}', title = '${pillC.title}'`)
    console.log(`S4 en: H pill text = '${pillH.text}', title = '${pillH.title}'`)
    expect.soft(pillC.text, "C's pill reads").toBe('Resolved')
    expect.soft(pillC.title, "C's pill title").toBe('Tracy marked this done')
    expect.soft(pillC.title, "never 'Resolved by Tracy'").not.toBe('Resolved by Tracy')
    expect.soft(pillH.text, "H's pill reads").toBe('Resolved')
    expect.soft(pillH.title, "H's pill title").toBe(`Resolved by ${name}`)

    // S4: a seat in Vietnamese on C.
    const vi = await seatContext(browser, 'a', { locale: 'vi-VN' })
    const pillCvi = await readPill(vi, C)
    console.log(`S4 vi: C pill title = '${pillCvi.title}'`)
    expect.soft(pillCvi.title, "C's pill title in Vietnamese").toBe('Tracy đã đánh dấu xong')
  } finally {
    // S5: clean up.
    if (ids.length > 0) {
      const clear = await api('a', 'POST', `/api/sites/${S}/comments/clear`, { ids })
      console.log(`S5: clear ${ids.length} comment(s): HTTP ${clear.status}`)
      expect(clear.status, 'S5: comments cleared').toBe(200)
    }
  }
})
