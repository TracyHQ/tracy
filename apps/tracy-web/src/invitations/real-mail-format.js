/** How real invitation mail is packaged (Setup › Email format). One row for the whole server, read at
 * the moment of each send, test and customer alike. Defaults follow the spec; every switch exists
 * to learn what makes Gmail file the mail under Promotions. The unsubscribe link is always there. */
import { randomUUID } from 'node:crypto'
import { realError, realId } from './real-store.js'

export const MAIL_FORMAT_DEFAULT = Object.freeze({
  // RFC 8058 List-Unsubscribe and List-Unsubscribe-Post headers.
  oneClickHeader: true,
  // 'notice': the Sendy-style centred footer; 'personal': one plain sentence in the letter's voice.
  footer: 'notice',
  // 'tracy': Message-ID on the Tracy host; 'sender': on the sender's domain (joomlart.com).
  messageIdDomain: 'tracy',
  // 'full': the template's HTML as saved; 'simple': only its body, the way a mail client composes.
  html: 'full',
  // The estimated-opens image in customer invitations (test sends never carry it).
  openImage: true,
  // Estimated clicks: web links go through /c/<token>/<n> on the Tracy host, in test sends too so a
  // test inbox shows the mail as customers get it; only customer invitations are counted. Off by
  // default: a link on another domain than the one it shows may change where Gmail files the mail.
  clickTracking: false
})

const fromRow = (row) =>
  row
    ? {
        oneClickHeader: row.mail_one_click_header,
        footer: row.mail_footer,
        messageIdDomain: row.mail_message_id_domain,
        html: row.mail_html,
        openImage: row.mail_open_image,
        clickTracking: row.mail_click_tracking
      }
    : { ...MAIL_FORMAT_DEFAULT }

export async function getMailFormat({ db }) {
  return fromRow((await db.query('select * from invitations_real_setting where id=1')).rows[0])
}

export async function setMailFormat({ db, value, actorId }) {
  realId(actorId)
  const keys = Object.keys(MAIL_FORMAT_DEFAULT)
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).some((k) => !keys.includes(k)) ||
    keys.some((k) => !(k in value)) ||
    typeof value.oneClickHeader !== 'boolean' ||
    !['notice', 'personal'].includes(value.footer) ||
    !['tracy', 'sender'].includes(value.messageIdDomain) ||
    !['full', 'simple'].includes(value.html) ||
    typeof value.openImage !== 'boolean' ||
    typeof value.clickTracking !== 'boolean'
  )
    throw realError('REAL_INVALID_MAIL_FORMAT')
  await db.query(
    `with changed as (
      insert into invitations_real_setting(id,retention_days,updated_by,mail_one_click_header,mail_footer,mail_message_id_domain,mail_html,mail_open_image,mail_click_tracking)
      values(1,30,$1,$2,$3,$4,$5,$6,$8)
      on conflict(id) do update set mail_one_click_header=$2,mail_footer=$3,mail_message_id_domain=$4,mail_html=$5,mail_open_image=$6,mail_click_tracking=$8,updated_by=$1,updated_at=clock_timestamp()
      returning id)
     insert into invitations_real_audit(id,actor_id,action) select $7,$1,'mail_format_setting' from changed`,
    [
      actorId,
      value.oneClickHeader,
      value.footer,
      value.messageIdDomain,
      value.html,
      value.openImage,
      randomUUID(),
      value.clickTracking
    ]
  )
  return getMailFormat({ db })
}
