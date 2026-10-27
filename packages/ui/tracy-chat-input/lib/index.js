/**
 * Node half. It draws nothing — but it is the ONLY half cordis hands `config` to.
 *
 * 🔒 MEASURED 07/09, AND IT COST A PRODUCTION ROUND TRIP. `config` in `cordis.patch.yml` reaches
 * THIS file. It never reaches `lib/client.js`: the browser loads that through dsh's own client
 * module system, which carries no plugin config. The first attempt read `config.audience` inside
 * the client half, shipped green through every gate, and did nothing on the lane — `dsh
 * --dump-config` showed the value sitting on the row exactly as written, while the screen kept
 * the old chips. So an option that changes the browser has to cross here first.
 *
 * The crossing is a meta tag on the served page, the same `webserver/index-inject` seam
 * `@tracy/dsh-brand` uses for the document title. A tag is readable before React mounts, needs no
 * request, and cannot arrive late — which matters because the chips render on first paint.
 */
export const AUDIENCE_META = 'tracy-chat-input-audience'

/**
 * @param ctx - cordis host context.
 * @param config - the row's config; `audience: 'onboarding'` switches the browser to the
 *   set for people who have connected no site yet.
 */
export function apply(ctx, config = {}) {
  if (config.audience !== 'onboarding') return
  ctx.on('webserver/index-inject', (table) => {
    table.push({
      kind: 'html',
      placement: 'head',
      html: `<meta name="${AUDIENCE_META}" content="onboarding">`
    })
  })
}
