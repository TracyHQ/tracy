/**
 * The problem report Help offers to copy onto Discord (plan P5).
 *
 * 🔒 BUILT BY CODE, NOT BY THE MODEL, from a short list of chosen fields. Discord is public, so the
 * report holds no email, no brief, no token and nothing of any conversation: only the site's name,
 * the time, the agent session's id, the browser and, in the person's own words, what went wrong
 * (their `/help` question, trimmed). A field Help does not know says "none" rather than a guess.
 *
 * Intent is matched on the person's own words in the eight interface languages; a match only ADDS
 * the report block under the normal answer, it never replaces the answer or sends anything.
 */
import type { AssistantKey, Translate } from './strings'

const WANTS_REPORT =
  /\b(report (a |an |the )?(bug|problem|issue|error)|found (a )?bug|bug report|something (is )?broken)\b|báo lỗi|báo cáo lỗi|gặp lỗi|fehler melden|einen fehler|signaler (un )?(bug|problème|erreur)|segnalare (un )?(bug|problema|errore)|bug melden|fout melden|报告.{0,4}(bug|问题|错误)|报错|发现.{0,3}(bug|问题|错误)|reportar (un )?(bug|error|problema)|informar (de )?(un )?(error|problema)/i

/** @param text - what the person typed after `/help`. */
export const wantsReport = (text: string): boolean => WANTS_REPORT.test(text)

export interface ReportEnv {
  /** The site the page names, or null. */
  site: string | null
  sessionId: string
  userAgent: string
  now: Date
  /** The person's own time zone, as the browser names it. */
  timeZone: string
}

/** Longest description copied: a report is a few lines, not a pasted essay. */
const DESCRIPTION_MAX = 400

/**
 * The text to copy.
 * @param env - the few facts the browser knows.
 * @param description - the person's own words.
 * @param t - the interface translator.
 */
export function reportText(env: ReportEnv, description: string, t: Translate): string {
  const none = t('report.none')
  const field = (key: AssistantKey, value: string | null) =>
    `${t(key)}: ${value && value.trim() !== '' ? value : none}`
  const local = env.now.toLocaleString('en-GB', { timeZone: env.timeZone, hour12: false })
  return [
    t('report.title'),
    field('report.site', env.site),
    field(
      'report.time',
      `${env.now.toISOString().slice(0, 16).replace('T', ' ')} UTC (${local} ${env.timeZone})`
    ),
    field('report.session', env.sessionId),
    field('report.browser', env.userAgent),
    field('report.describe', description.replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_MAX))
  ].join('\n')
}
