/**
 * The site update card in the site chat (#612), under the living plan carried there: once the plan changed after the
 * build, the owner updates the site from it, and only what the change touched is rebuilt. While the update runs its
 * task list shows ("Updating your site", Contract B partial run); once it ended the card says how it ended in the
 * server's own sentence and offers what can be done next: restore the previous version, or undo an update that did
 * not finish. A photo the owner asked to keep private that is still a file of the site is always shown, with the
 * files. Nothing here deletes the site or the chat.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { BuildProgress } from './BuildProgress'
import { buildEnded, createSiteBuildSource, type SiteAsk, type SiteBuildSource } from './site-build-source'
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
  return (
    <>
      {updating && state?.run && <BuildProgress run={state.run} t={t} />}
      {notice && (
        <section className="tv-bc-notice" aria-label={t('rebuild.title')} data-site-update="">
          {said && <p role="status">{state?.say}</p>}
          {changed && <p>{t('rebuild.changed')}</p>}
          {build.heldFile && (
            <>
              <p role="alert">{build.heldFile.say}</p>
              <p className="tv-bc-muted tv-bc-small">{t('rebuild.heldFiles')}</p>
              <ul className="tv-bc-small">
                {build.heldFile.files.map((file) => (
                  <li key={file}>
                    <code>{file}</code>
                  </li>
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
