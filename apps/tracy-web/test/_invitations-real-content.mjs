import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { syntheticSnapshot } from './_invitations-real.mjs'
import { syntheticZip } from './_invitations-real-zip.mjs'
import { previewRealImport, commitRealImport, listRealRecipients } from '../src/invitations/real-import.js'
export async function contentCampaign({ pool, keys, total = 2, offset = 50 }) {
  const actorId = randomUUID()
  const p = await previewRealImport({
    pool,
    keys,
    csvBytes: syntheticSnapshot({ total, offset }).csvBytes,
    name: 'Synthetic content',
    sourceDate: '2026-10-07',
    actorId
  })
  const c = await commitRealImport({
    pool,
    keys,
    previewId: p.previewId,
    digest: p.digest,
    revision: p.revision,
    requestKey: randomUUID(),
    actorId
  })
  const page = await listRealRecipients({ pool, keys, campaignId: c.id, limit: 100 })
  return {
    pool,
    keys,
    campaignId: c.id,
    actorId,
    revision: c.revision,
    recipients: page.items,
    expiresAt: c.expiresAt
  }
}
export async function contentZip({
  color = '#123456',
  html = '<p>Hello {{first_name}}</p><img src="images/logo.png" alt="Logo">',
  text = null
} = {}) {
  const image = await sharp({ create: { width: 3, height: 2, channels: 3, background: color } })
    .png()
    .toBuffer()
  return syntheticZip([
    { path: 'index.html', bytes: html },
    { path: 'images/logo.png', bytes: image },
    ...(text === null ? [] : [{ path: 'text.txt', bytes: text }])
  ])
}
