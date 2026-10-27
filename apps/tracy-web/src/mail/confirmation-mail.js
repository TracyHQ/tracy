/**
 * The whitelist confirmation mail. Moved here from `beta/confirmation.js` on 04/10/2026 when it took
 * the notification letter's layout: a domain imports only `lib/` and `db/`, so the builder lives
 * beside the layout it uses and `app.js` hands it to the door.
 */
import { escapeHtml } from '../lib/html.js'
import { DEFAULT_LANGUAGE, translator } from '../lib/i18n/index.js'
import { brandFooterText, notificationMail, safeUrl, unlinkedHtml } from './notification-mail.js'

// The notification letter's own inline link colour (the invitation's Decline).
const LINK = 'color:#a3462a;'

/**
 * The whitelist confirmation, in the language of the request that caused it (#797). Every sentence
 * is a key of `lib/i18n` (`mail.confirmation*`); what the visitor typed is filled in as plain text
 * and escaped once, for the HTML part.
 * @param {string} email
 * @param {{name: string, platforms: string[], site_count: string, website?: string | null}} data
 * @param {string} [marketingOrigin]
 * @param {string} [lang] - one of `WEB_LANGUAGES`; anything else reads as English.
 */
export function confirmationMail(email, data, marketingOrigin, lang = DEFAULT_LANGUAGE) {
  const t = translator(lang)
  const subject = t('mail.confirmationSubject')
  const summary = [
    t('mail.confirmationSummary'),
    t('mail.confirmationPlatforms', { platforms: data.platforms.join(', ') }),
    t('mail.confirmationSiteCount', { count: data.site_count }),
    ...(data.website ? [t('mail.confirmationWebsite', { website: data.website })] : [])
  ]
  const howItWorksUrl = marketingOrigin ? safeUrl(`${marketingOrigin}/how-it-works/`) : ''
  const howItWorks = howItWorksUrl ? [t('mail.confirmationHowItWorks', { url: howItWorksUrl })] : []
  // Since 04/10/2026 this mail wears the notification letter's layout: same header, the
  // system-font title, and the one-line footer without a Manage link (nothing here can be switched
  // off). No sign-off and no trademark line. It ends with the sign-in mail's "Did not request this?"
  // box, the same words and the same look in all three access mails (06/10/2026).
  const notRequested = { strong: t('mail.signInNotRequested'), rest: t('mail.signInNotRequestedRest') }
  const text = [
    t('mail.confirmationGreeting', { name: data.name }),
    '',
    t('mail.confirmationThanks', { email }),
    '',
    ...summary,
    '',
    ...howItWorks,
    '',
    `${notRequested.strong} ${notRequested.rest}`,
    '',
    brandFooterText(t)
  ].join('\n')
  const { html } = notificationMail({
    lang,
    subject,
    paragraphs: [
      { text: t('mail.confirmationGreeting', { name: data.name }) },
      { text: t('mail.confirmationThanks', { email }) },
      { html: summary.map((line) => unlinkedHtml(line)).join('<br>') },
      // A real link, not text: as text the autolink guard broke the address after "tracy." and
      // Gmail linked only "https://tracy." (measured 06/10/2026). Our own page, so a link is
      // what the reader needs; what the visitor typed above stays unlinkable.
      ...(howItWorksUrl
        ? [
            {
              html: t.html('mail.confirmationHowItWorks', {
                url: `<a href="${escapeHtml(howItWorksUrl)}" style="${LINK}">${escapeHtml(howItWorksUrl)}</a>`
              })
            }
          ]
        : []),
      { note: notRequested }
    ]
  })
  return { subject, text, html }
}
