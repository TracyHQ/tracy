/** Gallery removal markers remain distinct from same-size clear cut-outs after content-addressed uploads. */
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const MARKER =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:tracy="urn:tracy:picture" tracy:role="removed-gallery"/></rdf:RDF></x:xmpmeta>'

/** Stamp after Slot fit resizing, which would otherwise discard the metadata. Pixels stay fully transparent. */
export async function markGalleryRemovals(shaped) {
  const out = []
  for (const item of shaped) {
    if (!item.hide || item.group.role !== 'gallery') {
      out.push(item)
      continue
    }
    const bytes = await sharp(item.bytes).withXmp(MARKER).png().toBuffer()
    out.push({ ...item, bytes, ext: 'png', hash: createHash('sha256').update(bytes).digest('hex') })
  }
  return out
}
