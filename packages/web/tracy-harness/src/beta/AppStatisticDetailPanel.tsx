// Existing record drill-downs are retained beside the shared statistics tables.
import { Button } from '@tracy/ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLanguage, useT } from '../i18n/index.ts'
import {
  type AppStatisticDetail,
  AppStatisticReadError,
  type AppStatisticRow,
  type AppStatisticView,
  readErrorText
} from './app-statistic-api'
import {
  activityLabel,
  appStatisticTime,
  cmsLabel,
  platformLabel,
  releaseTypeLabel,
  sourceFieldLabel,
  viewLabel
} from './app-statistic-copy'

export function AppStatisticDetailPanel({
  selected,
  view,
  record,
  detailBusy,
  detailError,
  onClose,
  jump,
  link,
  quickstartList
}: {
  selected: string | null
  view: AppStatisticView
  record: AppStatisticDetail | null
  detailBusy: boolean
  detailError: Error | null
  onClose: () => void
  jump: (
    label: string,
    next: AppStatisticView,
    scope?: { id: string; label: string } | null,
    selection?: string | null
  ) => ReactNode
  link: (url: string | null | undefined, label?: string, title?: string) => ReactNode
  quickstartList: (rows: AppStatisticRow[], empty: string) => ReactNode
}) {
  const t = useT()
  const { lang } = useLanguage()
  const time = (value: string | null | undefined) => appStatisticTime(value, t, lang)
  const releaseAccess = t('appstat.meaning.releaseAccess')
  const quickstartMeaning = t('appstat.meaning.quickstart')
  const latest100Requests = t('appstat.detail.latest100Requests')
  return (
    <>
      {selected && (
        <aside
          aria-label={t('appstat.detail.label')}
          className="min-w-0 space-y-5 rounded-lg border border-border bg-card p-5 text-card-foreground text-sm lg:sticky lg:top-4"
        >
          <div className="flex items-start justify-between gap-3 border-border border-b pb-3">
            <div>
              <h2 className="break-all font-semibold text-base">
                {record?.row.name ||
                  record?.row.email ||
                  (view === 'downloads'
                    ? t('appstat.detail.downloadRequest')
                    : view === 'quickstarts'
                      ? t('appstat.detail.quickstartRequest')
                      : t('appstat.detail.copyDetails'))}
              </h2>
              <p className="mt-1 text-muted-foreground">
                {t('appstat.detail.of', { view: viewLabel(view, t) })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              aria-label={t('appstat.detail.close')}
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
          {detailBusy && !record && <p role="status">{t('appstat.detail.reading')}</p>}
          {detailError && (
            <p role="alert" className="text-destructive">
              {readErrorText(detailError, t, 'details')}
              {detailError instanceof AppStatisticReadError && detailError.signInRequired && (
                <a className="ml-2 underline" href="/login?next=%2Fops%2Fapp-statistic">
                  {t('appstat.signInAgain')}
                </a>
              )}
              {record && ` ${t('appstat.detail.showingLast')}`}
            </p>
          )}
          {record && (
            <>
              {view === 'users' ? (
                <>
                  <section>
                    <h3 className="mb-2 font-medium">{t('appstat.col.copies')}</h3>
                    {record.installs.length ? (
                      record.installs.map((install) => (
                        <div
                          key={install.id}
                          className="flex items-center justify-between gap-3 border-border border-b py-2"
                        >
                          {jump(t('appstat.detail.viewCopy'), 'installs', null, install.id)}
                          <span>{install.version || t('appstat.detail.versionNotRecorded')}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground">{t('appstat.detail.noCopies')}</p>
                    )}
                    {jump(`${t('appstat.detail.viewAllCopies')} →`, 'installs', {
                      id: record.row.id,
                      label: record.row.email || record.row.id
                    })}
                    {record.truncated?.installs && (
                      <p className="text-muted-foreground">{t('appstat.detail.latest100Copies')}</p>
                    )}
                  </section>
                  <section>
                    <h3 className="mb-2 font-medium">{viewLabel('quickstarts', t)}</h3>
                    {quickstartList(record.quickstarts ?? [], t('appstat.detail.noQuickstarts'))}
                    {jump(`${t('appstat.detail.viewQuickstarts')} →`, 'quickstarts', {
                      id: record.row.id,
                      label: record.row.email || record.row.id
                    })}
                    {record.truncated?.quickstarts && (
                      <p className="text-muted-foreground">{latest100Requests}</p>
                    )}
                    <p className="mt-2 text-muted-foreground">{quickstartMeaning}</p>
                  </section>
                </>
              ) : view === 'quickstarts' ? (
                <>
                  <section>
                    <h3 className="mb-2 font-medium">{t('appstat.detail.quickstartRequest')}</h3>
                    <p>
                      {record.row.template || t('appstat.detail.templateNotRecorded')} ·{' '}
                      {cmsLabel(record.row.cms, t)}
                    </p>
                    <dl className="mt-3 space-y-2">
                      <div>
                        <dt className="text-muted-foreground">{t('appstat.detail.requestedAt')}</dt>
                        <dd>{time(record.row.requestedAt ?? null)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t('appstat.col.referrer')}</dt>
                        <dd className="break-all">
                          {link(record.row.referrer, record.row.referrer ?? undefined) ?? (
                            <span className="text-muted-foreground">
                              {t('appstat.meaning.referrerUnknown')}
                            </span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t('appstat.detail.templatePage')}</dt>
                        <dd className="break-all">
                          {link(record.row.templateUrl) ?? (
                            <span className="text-muted-foreground">
                              {t('appstat.detail.noTemplatePage')}
                            </span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t('appstat.detail.packagePage')}</dt>
                        <dd className="break-all">
                          {link(record.row.releaseUrl, record.row.releaseUrl ?? undefined, releaseAccess) ??
                            t('appstat.notRecorded')}
                          <p className="text-muted-foreground">{releaseAccess}</p>
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-muted-foreground">{quickstartMeaning}</p>
                  </section>
                  <section>
                    <h3 className="mb-2 font-medium">{t('appstat.detail.account')}</h3>
                    {record.row.userId ? (
                      jump((record.row.email || record.row.userId) + ' →', 'users', null, record.row.userId)
                    ) : (
                      <>
                        <p>{t('appstat.detail.accountGone')}</p>
                        <p className="mt-2 text-muted-foreground">{t('appstat.detail.accountGone.body')}</p>
                      </>
                    )}
                  </section>
                  {record.row.userId && (
                    <section>
                      <h3 className="mb-2 font-medium">{t('appstat.detail.byAccount')}</h3>
                      {quickstartList(record.quickstarts ?? [], t('appstat.detail.noOtherQuickstarts'))}
                      {record.truncated?.quickstarts && (
                        <p className="text-muted-foreground">{latest100Requests}</p>
                      )}
                    </section>
                  )}
                  {record.row.userId && (
                    <section>
                      <h3 className="mb-2 font-medium">{t('appstat.detail.desktopApp')}</h3>
                      <p>{t('appstat.count.copies', { count: record.installs.length })}</p>
                      {jump(`${t('appstat.detail.viewAccount')} →`, 'users', null, record.row.userId)}
                    </section>
                  )}
                </>
              ) : (
                <>
                  <section>
                    <h3 className="mb-2 font-medium">
                      {view === 'downloads' ? t('appstat.detail.download') : t('appstat.detail.copy')}
                    </h3>
                    <p>
                      {record.row.version || t('appstat.detail.versionNotRecorded')} ·{' '}
                      {releaseTypeLabel(record.row.channel, t)} · {platformLabel(record.row, t)}
                    </p>
                    {record.row.osVersion && (
                      <p className="mt-2">
                        {t('appstat.detail.osVersion', { version: record.row.osVersion })}
                      </p>
                    )}
                    <dl className="mt-3 space-y-2">
                      <div>
                        <dt className="text-muted-foreground">
                          {view === 'downloads'
                            ? t('appstat.detail.requestedAt')
                            : t('appstat.detail.firstConnection')}
                        </dt>
                        <dd>
                          {time(
                            view === 'downloads' ? (record.row.requestedAt ?? null) : record.row.firstSeen
                          )}
                        </dd>
                      </div>
                      {view === 'installs' && (
                        <div>
                          <dt className="text-muted-foreground">{t('appstat.col.lastConnection')}</dt>
                          <dd>{time(record.row.lastSeen)}</dd>
                        </div>
                      )}
                    </dl>
                  </section>
                  {view === 'installs' && (
                    <section>
                      <h3 className="mb-2 font-medium">{t('appstat.account')}</h3>
                      {record.row.userId ? (
                        <>
                          {jump(
                            (record.row.email || record.row.userId) + ' →',
                            'users',
                            null,
                            record.row.userId
                          )}
                          {record.row.linkedAt && (
                            <p className="mt-2">
                              {t('appstat.detail.linkedAt', { time: time(record.row.linkedAt) })}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p>{t('appstat.account.unlinked')}</p>
                          <p className="mt-2 text-muted-foreground">
                            {t('appstat.detail.accountUnknown.body')}
                          </p>
                        </>
                      )}
                    </section>
                  )}
                  {view === 'downloads' && (
                    <p className="text-muted-foreground">{t('appstat.detail.downloadNote')}</p>
                  )}
                  {view === 'installs' && (
                    <p className="text-muted-foreground">
                      {t('appstat.meaning.connection')} {t('appstat.detail.copyNote')}
                    </p>
                  )}
                </>
              )}
              {record.row.source && (
                <section>
                  <h3 className="mb-2 font-medium">
                    {view === 'downloads' ? t('appstat.source.download') : t('appstat.source.firstSignIn')}
                  </h3>
                  <dl className="space-y-1">
                    {Object.entries(record.row.source)
                      .filter(([, value]) => !!value)
                      .map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <dt className="text-muted-foreground">{sourceFieldLabel(key, t)}</dt>
                          <dd className="break-all">{value}</dd>
                        </div>
                      ))}
                  </dl>
                </section>
              )}
              {view !== 'downloads' && (
                <section>
                  <h3 className="mb-2 font-medium">
                    {t('appstat.detail.issues', { count: record.issues.length })}
                  </h3>
                  {record.issues.length ? (
                    record.issues.map((issue, index) => (
                      <div
                        key={`${issue.siteKey}-${index}`}
                        className="space-y-1 border-border border-b py-2"
                      >
                        <p className="font-medium">{issue.siteKey}</p>
                        <p>{issue.reason || t('appstat.detail.issueUnavailable')}</p>
                        {issue.step && (
                          <p className="text-muted-foreground">
                            {t('appstat.detail.step', { step: issue.step })}
                          </p>
                        )}
                        <p className="text-muted-foreground">{time(issue.at)}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">{t('appstat.detail.noIssues')}</p>
                  )}
                  {record.truncated?.issues && (
                    <p className="text-muted-foreground">{t('appstat.detail.issuesLimited')}</p>
                  )}
                </section>
              )}
              {view !== 'downloads' && (
                <section>
                  <h3 className="mb-2 font-medium">{t('appstat.detail.activity')}</h3>
                  <p className="mb-2 text-muted-foreground">{t('appstat.detail.activity.sub')}</p>
                  {record.activity.length ? (
                    record.activity.map((event) => (
                      <div key={event.id} className="space-y-1 border-border border-b py-2">
                        <p>{activityLabel(event.kind, t)}</p>
                        {event.siteKey && <p className="text-muted-foreground">{event.siteKey}</p>}
                        <p className="text-muted-foreground">{time(event.at)}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">{t('appstat.detail.noActivity')}</p>
                  )}
                  {record.truncated?.activity && (
                    <p className="text-muted-foreground">{t('appstat.detail.latest100Activity')}</p>
                  )}
                </section>
              )}
            </>
          )}
        </aside>
      )}
    </>
  )
}
