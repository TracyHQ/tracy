// A tracy-host that takes a site off itself the way `DELETE /api/sites/:key` asks for it: through
// the keyed go-live door (`op: 'teardown'`), with a job that ends by teardown.sh's own closing line
// — the only word the site's row is let go on (`sites/publish-store.js` `settleGoLive`).

/**
 * Answer the two calls of a delete's teardown, or null for any other call.
 * @param {string | URL | Request} input
 * @param {{ body?: string } | undefined} init
 * @returns {Response | null}
 */
export function answerTeardown(input, init) {
  const u = new URL(String(input))
  if (u.pathname === '/_host/go-live') {
    const ask = JSON.parse(init?.body ?? '{}')
    if (ask.op !== 'teardown') return null
    return new Response(JSON.stringify({ jobId: `teardown-${ask.label}` }), { status: 202 })
  }
  if (u.pathname.startsWith('/_host/jobs/teardown-')) {
    const label = u.pathname.slice('/_host/jobs/teardown-'.length)
    return new Response(
      JSON.stringify({
        state: 'done',
        step: 'go-live:teardown',
        exitCode: 0,
        output: `TRACY_RESULT torn_down=1 label=${label}\n==> ${label} is gone`
      }),
      { status: 200 }
    )
  }
  return null
}
