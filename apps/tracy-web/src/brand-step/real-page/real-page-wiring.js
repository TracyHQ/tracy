// Assembles the real-page check from the server's own pieces (brand bench, #322). The pieces come in from app.js (this
// directory may import only lib/ and db/): the Apply door as the internal account, `setSiteBrand`, the site finder, the
// host job runner (design-system job), the host call (capture). Returns null when the server has no trial site or no
// account for it configured: the bench then runs without the real-page check, as before.
import { captureRealPage } from './real-page-capture.js'
import { assertTrialSite } from './trial-guard.js'
import { createTrialWriter } from './trial-writer.js'

const DS_JOB_MS = 130_000

/**
 * @param {{ trialLabel: string | null, account: string | null, findSite: (label: string) => Promise<any>,
 *   applyAs: (email: string, call: object) => Promise<any>, setSiteBrand: Function,
 *   runSiteJob: (site: any, input: object, ms: number) => Promise<{ ok: boolean, output?: string, reason?: string }>,
 *   hostCall: (site: any, body: object) => Promise<{ ok: boolean, status?: number, body?: any }>,
 *   bodyFor?: (site: any) => object, contractModule: (kit: object) => object | null, palette?: string[] }} deps
 */
export function createRealPage(deps) {
  const { trialLabel, account } = deps
  if (!trialLabel || !account) return null
  const write = createTrialWriter({
    trialLabel,
    findSite: deps.findSite,
    door: (call) => deps.applyAs(account, call),
    setSiteBrand: deps.setSiteBrand,
    contractModule: deps.contractModule,
    accentJob: async (site, payload) => {
      const ran = await deps.runSiteJob(
        site,
        { kind: 'site-ds-slot', platform: site.platform, mode: 'apply', payload },
        DS_JOB_MS
      )
      if (!ran.ok) return { ok: false, reason: ran.reason ?? 'job failed' }
      try {
        const last = String(ran.output ?? '')
          .trim()
          .split('\n')
          .pop()
        const said = JSON.parse(last ?? '')
        return said?.ok === true
          ? { ok: true }
          : { ok: false, reason: said?.code ?? said?.error ?? 'the site refused the module' }
      } catch {
        return { ok: false, reason: 'the design system job gave no answer' }
      }
    }
  })
  return {
    write,
    palette: deps.palette,
    // Capture takes any site; the bench hands it the trial site, found again by label and checked.
    capture: async ({ site }) => {
      const full = assertTrialSite(await deps.findSite(site.label), trialLabel)
      return captureRealPage({
        site: full,
        hostCall: (body) => deps.hostCall(full, body),
        ...(deps.bodyFor ? { bodyFor: deps.bodyFor } : {})
      })
    }
  }
}
