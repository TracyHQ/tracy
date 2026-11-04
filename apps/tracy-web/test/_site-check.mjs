// Fixtures for the site check's entry point: a fake site door answering `content.contract inspect` as the plugin does
// (`slots[].current`, `pages`), and a made-up write report. Nothing here is a real business or a real template.
import { CONTRACT, SITE } from './_write-step-run.mjs'

/** A write report line the way the write step leaves it. */
export const written = (slot, key, ordered, extra = {}) => ({
  slot,
  key,
  owner: 'writer',
  status: 'written',
  reason: null,
  readBack: null,
  ordered,
  ...extra
})

export const report = (slots, over = {}) => ({
  version: 'site-write-report/1',
  status: 'done',
  cause: null,
  site: SITE,
  kit: CONTRACT,
  contract: CONTRACT,
  slots,
  ...over
})

const PAGES = [
  {
    entity: 'menuItem-1',
    route: 'home',
    link: 'index.php?view=featured',
    assignedModules: [{ entity: 'module-2' }]
  },
  { entity: 'menuItem-2', route: 'about', link: 'index.php?view=article&id=7', assignedModules: [] }
]

/**
 * A site that holds `held` (content map key to current value) and answers other read actions from `answers`.
 * @param {Record<string, string>} held
 * @param {{ inspect?: object, types?: Record<string, object>, answers?: Record<string, object> }} [script]
 */
export function checkSite(held, script = {}) {
  const calls = []
  const entityOf = (key) => key.slice(0, key.lastIndexOf('.'))
  return {
    calls,
    door: {
      async apply(call) {
        calls.push(call)
        if (call.action !== 'content.contract')
          return script.answers?.[call.action] ?? { ok: false, error: 'unexpected_action' }
        return (
          script.inspect ?? {
            ok: true,
            contract: CONTRACT,
            revision: 'rev-1',
            pages: PAGES,
            slots: Object.entries(held).map(([key, current]) => ({
              key,
              entity: entityOf(key),
              type: 'text',
              ...script.types?.[key],
              current
            }))
          }
        )
      }
    }
  }
}
