// The site check's way to the host: `host(payload)` asks the site's tracy-host to read pages in its browser
// (`POST /_host/demo-qa`) and answers the body. A refusal or a timeout is an error, so a group that asked is unmeasured.
/** Joomla answers only under `/index.php` unless URL rewriting is on, so the asked pages go there, as the host does for planned ones. */
export const underIndex = (platform, p) =>
  platform === 'joomla' && p !== '/' && !/^\/index\.php(?=\/|$)/.test(p) ? `/index.php${p}` : p

/** A page reader whose asked `pages` go under `/index.php` on Joomla, as `hostMeasure` sends them (the host itself adds it to `plan` only). */
export const underIndexHost =
  (host, platform = 'joomla') =>
  ({ pages, ...payload }) =>
    host({
      ...payload,
      ...(Array.isArray(pages) ? { pages: pages.map((p) => underIndex(platform, p)) } : {})
    })

/**
 * @param {{ hostCall: Function, config: object, site: object, selfNames: Function, fetchImpl?: typeof fetch }} input
 *   `site` is the site's row (label, platform, port, host); `hostCall` is `host/client.js`'s; `selfNames(config, site)`
 *   is `ops/quickstarts.js` `demoSelfNames` (the names the site answers to), passed in so this file loads no web framework
 */
export function hostMeasure({ hostCall, config, site, selfNames, fetchImpl = fetch }) {
  return async ({ timeoutMs = 260_000, ...payload }) => {
    const answer = await hostCall(
      config,
      site.host ?? config.defaultHost,
      '/demo-qa',
      {
        label: site.label,
        platform: site.platform,
        port: site.port ?? null,
        ...selfNames(config, site),
        ...payload,
        ...(Array.isArray(payload.pages)
          ? { pages: payload.pages.map((p) => underIndex(site.platform, p)) }
          : {})
      },
      { fetchImpl, timeoutMs }
    )
    if (!answer?.ok)
      throw new Error(
        `The host refused the page read (${answer?.timedOut ? 'timed out' : (answer?.body?.code ?? answer?.status)})`
      )
    return answer.body
  }
}
