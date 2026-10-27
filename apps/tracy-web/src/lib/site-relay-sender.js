/**
 * The address a site's mail leaves the Tracy relay from: `<label>@SITE_MAIL_DOMAIN`.
 *
 * One definition for two readers. `mail/site-mail/policy.js` shows it as the site's `fromAddress`
 * (`/api/ops/mail`), and the provision roads that have no owner to name (a demo the sweep redeploys,
 * a stock instance) hand it to the host as `mailSender`, so an EmDash site starts with a sender of
 * its own instead of one invented for it (#827: the sweep's `demo-sweep@tracy` was refused by
 * `configure-mail.mjs` and every EmDash demo stopped provisioning).
 *
 * 🔒 IT IS A SENDER, NEVER AN OWNER. `ownerEmail` also creates an EmDash admin account
 * (`mint-agent-admin.cjs`), so this address travels in its own field and never becomes a person
 * who can sign in.
 *
 * @param {string} label the site's fleet label
 * @param {{domain?: string | null} | null | undefined} siteMail `config.siteMail`
 * @returns {string | null} null when this deployment names no `SITE_MAIL_DOMAIN`: no address is guessed.
 */
export function relaySenderFor(label, siteMail) {
  const domain = siteMail?.domain
  return label && domain ? `${label}@${domain}` : null
}
