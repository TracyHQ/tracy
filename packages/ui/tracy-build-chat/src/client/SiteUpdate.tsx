/**
 * The site update card in the site chat (#612), under the living plan carried there: once the plan changed after the
 * build, the owner updates the site from it, and only what the change touched is rebuilt. While the update runs its
 * task list shows ("Updating your site", Contract B partial run); once it ended the card says how it ended in the
 * server's sentence (by its stable code, in the owner's language) and offers what can be done next: restore the
 * previous version, or undo an update that did not finish. A photo the owner asked to keep private that is still a
 * file of the site is always shown, each file said in words, never by its path. Nothing here deletes the site or the
 * chat.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { BuildProgress } from './BuildProgress'
import { buildEnded, createSiteBuildSource, type SiteAsk, type SiteBuildSource } from './site-build-source'
import { heldFileKeyOf, rebuildSayKeyOf } from './rebuild-strings'
import type { DraftSource } from './sources'
import type { Translate } from './strings'

export interface SiteUpdateDeps {
  drafts: DraftSource
  t: () => Translate
  fetch?: typeof fetch
}

export function SiteUpdate({ deps, source }: { deps: SiteUpdateDeps; source?: SiteBuildSource }) {
  const sites = useMemo(() => source ?? createSiteBuildSource(deps.fetch), [source, deps.fetch])
  const state = useSyncExternalStore(sites.subscribe, sites.read, sites.read)
  const draft = useSyncExternalStore(deps.drafts.subscribe, deps.drafts.read, deps.drafts.read)
  const [pending, setPending] = useState<SiteAsk | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => void deps.drafts.load(), [deps.drafts])
  const build = state?.build
  if (!build?.siteKey) return null
  const t = deps.t()
  const ended = buildEnded(build)
  const plan = draft?.plan
  const changed =
    ended &&
    !build.busy &&
    !build.unfinished &&
    plan &&
    (plan.id !== build.plan.id || plan.revision !== build.plan.revision)
  const updating = !ended && build.kind === 'partial'
  const send = async (kind: SiteAsk, body?: unknown) => {
    setPending(kind)
    setFailed(false)
    const sent = await sites.ask(kind, body)
    setPending(null)
    setFailed(!sent)
  }
  const restorable = ended && build.restorable === true && !build.busy
  const undo = ended && build.unfinished === true && !build.busy
  const said = ended && Boolean(state?.say)
  const notice = changed || said || restorable || undo || failed || Boolean(build.heldFile)
  if (!(updating && state?.run) && !notice) return null
  // A sentence by its stable code, in the owner's language; the server's own words only for a code the table lacks.
  const shownSay = (code: string | null | undefined, say: string) => {
    const key = rebuildSayKeyOf(code)
    return key ? t(key) : say
  }
  // Each held file said by what it is, numbered; never its path. A kind the table lacks is said as a photo.
  const heldFilesShown = (build.heldFile?.files ?? []).map((file, i) =>
    t(heldFileKeyOf(file?.what) ?? 'rebuild.heldFile.person-photo', { n: i + 1 })
  )
  return (
    <>
      {updating && state?.run && <BuildProgress run={state.run} t={t} />}
      {notice && (
        <section className="tv-bc-notice" aria-label={t('rebuild.title')} data-site-update="">
          {said && state?.say && <p role="status">{shownSay(state.say.code, state.say.say)}</p>}
          {changed && <p>{t('rebuild.changed')}</p>}
          {build.heldFile && (
            <>
              <p role="alert">
                {shownSay(build.heldFile.sayCode ?? build.heldFile.code, build.heldFile.say)}
              </p>
              <p className="tv-bc-muted tv-bc-small">{t('rebuild.heldFiles')}</p>
              <ul className="tv-bc-small">
                {heldFilesShown.map((words, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: the files have no identity the owner sees
                  <li key={i}>{words}</li>
                ))}
              </ul>
            </>
          )}
          {(changed || restorable || undo || failed) && (
            <div className="tv-bc-tfoot">
              {failed && (
                <span className="tv-bc-grow tv-bc-error" role="status">
                  {t('rebuild.failed')}
                </span>
              )}
              {undo && (
                <button
                  type="button"
                  className="tv-bc-btn"
                  data-primary=""
                  disabled={pending !== null}
                  onClick={() => void send('abandon')}
                >
                  {t('rebuild.undo')}
                </button>
              )}
              {restorable && (
                <button
                  type="button"
                  className="tv-bc-btn"
                  disabled={pending !== null}
                  onClick={() => void send('restore')}
                >
                  {t('rebuild.restore')}
                </button>
              )}
              {changed && plan && (
                <button
                  type="button"
                  className="tv-bc-btn"
                  data-primary=""
                  disabled={pending !== null}
                  onClick={() => void send('revise', { plan: { id: plan.id, revision: plan.revision } })}
                >
                  {t('rebuild.update')}
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </>
  )
}
