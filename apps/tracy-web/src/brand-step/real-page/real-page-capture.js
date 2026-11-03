// Capture of ANY site's real pages for the brand check (#322): asks the site's host for the real-page views
// (tracy-host `real-page-views.js`, mode `real-page/1`) and decodes the answer. It takes a site, not "the trial
// site": the bench passes the trial site, and step 9 of the customer flow will pass the customer's own site.
export class RealPageCaptureError extends Error {
  constructor(reason) {
    super(`REAL_PAGE_CAPTURE: ${reason}`)
    this.code = 'REAL_PAGE_CAPTURE'
    this.reason = reason
  }
}

/**
 * @param {{ site: object, hostCall: (body: object) => Promise<{ ok: boolean, status?: number, body?: any }>,
 *   bodyFor?: (site: object) => object, path?: string, selectors?: object }} input
 *   `hostCall` posts a body to the site's host capture door; `bodyFor` adds what reaches the site (port, public name).
 * @returns {Promise<{ url: string, views: object[], icons: object[], colours: object }>} views carry `png` as a Buffer
 */
export async function captureRealPage({ site, hostCall, bodyFor = () => ({}), path = '/', selectors }) {
  const answer = await hostCall({
    label: site.label,
    platform: site.platform,
    layouts: [{ key: 'home', path }],
    port: site.port ?? null,
    ...bodyFor(site),
    ...(selectors ? { selectors } : {}),
    mode: 'real-page/1'
  })
  if (!answer?.ok || answer.body?.ok !== true || !Array.isArray(answer.body.views))
    throw new RealPageCaptureError(
      answer?.body?.reason ?? answer?.body?.code ?? `the host answered ${answer?.status ?? 'nothing'}`
    )
  const { url, views, icons = [], colours = {} } = answer.body
  return {
    url,
    icons,
    colours,
    views: views.map((v) => ({ ...v, png: typeof v.png === 'string' ? Buffer.from(v.png, 'base64') : null }))
  }
}
