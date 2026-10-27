/** Words of Desktop App Statistics that depend on a record; every function takes the caller's `t`. */
import { formatWith } from '../i18n/format.ts'
import type { T } from '../i18n/index.ts'
import type { AppStatisticRow, AppStatisticView } from './app-statistic-api'

export const APP_STATISTIC_VIEWS: readonly AppStatisticView[] = [
  'users',
  'downloads',
  'installs',
  'quickstarts'
]
export const viewLabel = (view: AppStatisticView, t: T) => t(`appstat.view.${view}`)

export const appStatus = (row: AppStatisticRow, t: T) =>
  t(
    row.lastOpened
      ? 'appstat.status.opened'
      : row.installs > 0
        ? 'appstat.status.signedIn'
        : 'appstat.status.templatesOnly'
  )
export const sourceLabel = (row: AppStatisticRow, t: T) =>
  [...new Set([row.source?.source, row.source?.medium].filter(Boolean))].join(' · ') || t('appstat.unknown')
/** Product names: the same in every language. */
export const OS_NAMES: Record<string, string> = { macos: 'macOS', windows: 'Windows', linux: 'Linux' }
const CMS_NAMES: Record<string, string> = {
  joomla: 'Joomla',
  j6: 'Joomla 6',
  j5: 'Joomla 5',
  wordpress: 'WordPress',
  wp7: 'WordPress 7',
  emdash: 'EmDash'
}
export const cmsLabel = (value: string | null | undefined, t: T) =>
  value == null ? t('appstat.notRecorded') : Object.hasOwn(CMS_NAMES, value) ? CMS_NAMES[value] : value
export const platformLabel = (row: AppStatisticRow, t: T) =>
  [
    row.platform ? (OS_NAMES[row.platform] ?? row.platform) : null,
    row.arch ? t('appstat.processor', { arch: row.arch }) : null
  ]
    .filter(Boolean)
    .join(' · ') || t('appstat.notRecorded')
const ACTIVITY_KEYS: Record<string, string> = {
  'account.first_sign_in': 'appstat.activity.firstSignIn',
  'desktop.app_opened': 'appstat.activity.appOpened',
  'site.create': 'appstat.activity.siteCreated',
  'site.import': 'appstat.activity.siteImported',
  'site.edit': 'appstat.activity.siteEdited',
  'site.undo': 'appstat.activity.changeUndone',
  'site.go_live': 'appstat.activity.siteLive',
  'site.stuck': 'appstat.activity.siteIssue',
  'site.result': 'appstat.activity.siteResult'
}
export const activityLabel = (kind: string, t: T) =>
  t(Object.hasOwn(ACTIVITY_KEYS, kind) ? ACTIVITY_KEYS[kind] : 'appstat.activity.other')
export const dateBasis = (view: AppStatisticView, t: T) =>
  t(
    view === 'users'
      ? 'appstat.dateBasis.users'
      : view === 'installs'
        ? 'appstat.dateBasis.installs'
        : 'appstat.dateBasis.requests'
  )

/** Statistics use the same UTC+7 calendar as User Growth Statistics. */
export const appStatisticDay = (time: string | number | Date) =>
  new Date(new Date(time).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
/** An exact UTC+7 time in the language on screen (English keeps the day-month-year order). */
export const appStatisticTime = (time: string | null | undefined, t: T, lang = 'en') =>
  time
    ? t('appstat.timeUtc7', {
        time: formatWith(
          time,
          { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' },
          lang
        )
      })
    : t('appstat.notRecorded')
const SOURCE_FIELD_KEYS: Record<string, string> = {
  source: 'appstat.sourceField.source',
  medium: 'appstat.sourceField.medium',
  campaign: 'appstat.sourceField.campaign',
  content: 'appstat.sourceField.content'
}
export const sourceFieldLabel = (key: string, t: T) =>
  t(Object.hasOwn(SOURCE_FIELD_KEYS, key) ? SOURCE_FIELD_KEYS[key] : 'appstat.sourceField.other')

const RELEASE_TYPE_KEYS: Record<string, string> = {
  stable: 'appstat.releaseType.stable',
  dev: 'appstat.releaseType.dev',
  preview: 'appstat.releaseType.preview'
}
/** A release type's words; an unknown type the server sends shows as itself. */
export const releaseTypeLabel = (value: string | null | undefined, t: T) =>
  value == null
    ? t('appstat.notRecorded')
    : Object.hasOwn(RELEASE_TYPE_KEYS, value)
      ? t(RELEASE_TYPE_KEYS[value])
      : value
