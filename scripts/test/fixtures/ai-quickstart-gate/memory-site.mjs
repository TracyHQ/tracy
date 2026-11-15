// A site in memory for write safety and the structure measurements (ticket #586): the build team's memory doors of the
// invented florist kit, written by their write step, every page printed by the memory renderer (every value raw, as
// the measured template prints it), and scripted faults: a door that answers an error or refuses a call, a page that
// answers an error. Its pages link to one another (a hidden page leaves the menu), a hidden record answers 404, and a copy taken off its pages is not
// printed. Nothing here is a real template.
import { runDraftWrite } from '../../../../apps/tracy-web/src/step-chain-draft-write.js'
import { memoryDoors } from '../../../../packages/wo/website-opportunities/domain/write-order-memory-doors.mjs'
import { renderedOf } from '../../../../packages/wo/website-opportunities/domain/write-order-memory-render.mjs'
import { openMarkerPicture } from '../../../ai-quickstart/gate/memory-write.mjs'

export const ORIGIN = 'http://florist.example'

/**
 * @param {object} kit the florist kit
 * @param {{door?: (call: object) => string | {code: string, details?: object} | null, pageFails?: (html: string) => boolean, reset?: boolean,
 *   escaped?: boolean}} [faults] `door(call)`: the code a door call fails with (a server error or a refusal), or
 *   null; `pageFails(html)`: the page answers 500; `pageStatus(html, url)`: the status the page answers instead of
 *   200 (0: no answer, 404: not found), or null; `staleLinks`: the menu keeps the links of hidden pages (a template
 *   whose menu does not follow a hidden page); `reset: false`: the site has no reset hook; `decode`: the template
 *   decodes stored quote references before it prints a value (a value then prints as markup)
 */
export function memorySiteOf(
  kit,
  {
    door = () => null,
    pageFails = () => false,
    pageStatus = () => null,
    staleLinks = false,
    reset = true,
    decode = false
  } = {}
) {
  let memory = null
  const hidden = new Set()
  const off = new Set()
  const counts = { resets: 0, writes: 0, fetches: 0 }
  const fresh = () => {
    memory = memoryDoors({ lock: kit.lock, contentMap: kit.blankContract })
    hidden.clear()
    off.clear()
  }
  fresh()
  const faulty = (doors) => {
    const out = { ...doors }
    for (const name of ['update', 'contract']) {
      const inner = doors[name]
      out[name] = async (call) => {
        // A fault is a code, or `{code, details}` (a door that names where it refused: a slot, a column).
        const fault = door({ door: name, ...call })
        const code = typeof fault === 'string' ? fault : (fault?.code ?? null)
        if (code)
          throw Object.assign(new Error(code + ': scripted'), {
            code,
            ...(fault?.details ? { details: fault.details } : {})
          })
        return inner(call)
      }
    }
    return out
  }
  let pagesOfBuild = []
  const site = {
    counts,
    get memory() {
      return memory
    },
    doors: () => faulty(memory.doors),
    reset: reset
      ? async () => {
          counts.resets += 1
          fresh()
        }
      : null,
    async write(built) {
      counts.writes += 1
      let saved = {}
      const record = { save: (state) => void (saved = structuredClone(state)) }
      let report
      try {
        report = await runDraftWrite({
          plan: built.writePlan,
          doors: faulty(memory.doors),
          record,
          openStored: openMarkerPicture(built.registry),
          runId: 'run-memory-site'
        })
      } catch (error) {
        report = { status: 'stopped', code: error.code ?? 'write_failed', details: error.details ?? null }
      }
      return { report, record: { ids: saved.ids ?? {}, paths: saved.paths ?? {} } }
    },
    async pages(built, record) {
      pagesOfBuild = built.order.pages.map((p) => ({
        pageType: p.pageType,
        path: '/' + p.id,
        url: ORIGIN + '/' + p.id,
        home: Boolean(p.home),
        record: { kind: 'menuItem', id: record.ids?.['menuItem:mainmenu:' + p.id] ?? null }
      }))
      return pagesOfBuild
    },
    async fetch(url) {
      counts.fetches += 1
      const page = pagesOfBuild.find((p) => p.url === url)
      if (!page || hidden.has(page.record.kind + ':' + page.record.id))
        return { status: 404, html: '<html></html>' }
      const shown = new Map([...memory.site.records.module].filter(([id]) => !off.has(Number(id))))
      const view = { site: { ...memory.site, records: { ...memory.site.records, module: shown } } }
      const listed = pagesOfBuild.filter((p) => staleLinks || !hidden.has(p.record.kind + ':' + p.record.id))
      const nav = listed.map((p) => '<a href="' + p.path + '">' + p.pageType + '</a>').join('')
      // The florist copies keep their value as the whole params column: printed raw, as words and in an attribute.
      const params = [...shown.values()]
        .filter((m) => typeof m.params === 'string' && m.params !== '{}')
        .map((m) => '<p data-m="' + m.title + '" data-v="' + m.params + '">' + m.params + '</p>')
        .join('')
      const printed = renderedOf(view) + params
      const body = decode ? printed.replaceAll('&quot;', '"').replaceAll('&#039;', "'") : printed
      const html = '<html><body><nav>' + nav + '</nav>' + body + '</body></html>'
      const status = pageStatus(html, url)
      if (status === 0) return { status: 0, html: '' }
      return { status: pageFails(html) ? 500 : (status ?? 200), html }
    },
    // A hidden record answers 404 until it is published again.
    hide: async ({ kind, id }) => void hidden.add(kind + ':' + id),
    show: async ({ kind, id }) => void hidden.delete(kind + ':' + id),
    async off(ops, record) {
      for (const op of ops) if (record.ids?.[op]) off.add(Number(record.ids[op]))
    },
    async back(ops, record) {
      for (const op of ops) if (record.ids?.[op]) off.delete(Number(record.ids[op]))
    }
  }
  return site
}
