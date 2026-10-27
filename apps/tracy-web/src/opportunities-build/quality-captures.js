/** Keep the original render and readable derivatives bound to the same content and pixel coordinates. */
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { qualityHash } from './quality-dossier.js'

const fail = (code) => Object.assign(new Error(code), { code })
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const HASH = /^[a-f0-9]{64}$/
export const QUALITY_VIEWPORTS = Object.freeze([
  { width: 1440, height: 900, dpr: 1 },
  { width: 390, height: 844, dpr: 1 }
])
const pathOk = (p) =>
  typeof p === 'string' &&
  /^\/(?![/\\])[^\s\\?#]*$/.test(p) &&
  p.length <= 512 &&
  !/(?:^|\/)\.{1,2}(?:\/|$)|%(?:2e|2f|5c|00)/i.test(p)

/** All main pages and retained public details are read; shared chrome is present on each route. */
export function qualityReviewRoutes({ manifest, plan }) {
  const routes = new Set()
  for (const page of manifest.pages ?? []) {
    if (!pathOk(page.route)) throw fail('QUALITY_REVIEW_ROUTE')
    routes.add(page.route)
  }
  for (const record of manifest.records ?? []) {
    if (!record.defaultLocale || !record.route) continue
    const decision = plan.records?.find((p) => p.key === record.key)
    if (!decision || !['planned', 'preserved-with-reason'].includes(decision.state)) continue
    const route = decision.newSlug
      ? record.route.slice(0, -encodeURIComponent(record.slug).length) + encodeURIComponent(decision.newSlug)
      : record.route
    if (!pathOk(route)) throw fail('QUALITY_REVIEW_ROUTE')
    routes.add(route)
  }
  if (!routes.size || routes.size > 20) throw fail('QUALITY_REVIEW_ROUTES_LIMIT')
  return [...routes]
}

/** The browser adapter supplies actual PNG/DOM bytes after lazy images, fonts and decoding settle. */
export async function sliceQualityCapture({ route, contentHash, read, overlap = 64, tileHeight = 1100 }) {
  const viewport = read?.viewport
  if (
    !pathOk(route) ||
    !HASH.test(contentHash ?? '') ||
    ![1440, 390].includes(viewport?.width) ||
    ![1, 2].includes(viewport?.dpr) ||
    !Number.isInteger(viewport?.height) ||
    viewport.height < 1 ||
    !Number.isInteger(read?.cssHeight) ||
    read.cssHeight < 1 ||
    !Number.isInteger(overlap) ||
    overlap < 0 ||
    overlap > 128 ||
    !Number.isInteger(tileHeight) ||
    tileHeight < 500 ||
    tileHeight > 1100 ||
    overlap >= tileHeight
  )
    throw fail('QUALITY_CAPTURE_SHAPE')
  if (
    read.status !== 200 ||
    !Buffer.isBuffer(read.png) ||
    read.png.length > 48 * 1024 * 1024 ||
    typeof read.source !== 'string' ||
    !read.source.trim() ||
    typeof read.text !== 'string' ||
    !read.text.trim() ||
    read.fontsReady !== true ||
    read.imagesDecoded !== true ||
    read.lazyComplete !== true ||
    read.renderComplete !== true ||
    !Array.isArray(read.errors) ||
    read.errors.length
  )
    throw fail('QUALITY_CAPTURE_INCOMPLETE')
  const original = sharp(read.png, { limitInputPixels: 80_000_000 }),
    info = await original.metadata()
  if (
    info.format !== 'png' ||
    info.width !== viewport.width * viewport.dpr ||
    info.height !== read.cssHeight * viewport.dpr ||
    info.pages > 1
  )
    throw fail('QUALITY_CAPTURE_DIMENSIONS')
  const stats = await original.clone().stats()
  if (stats.channels.every((channel) => channel.stdev < 0.25)) throw fail('QUALITY_CAPTURE_UNREADABLE')
  const imageHash = sha(read.png),
    id = `${qualityHash({ route, viewport, imageHash }).slice(0, 24)}`
  const pixels = [
    { id: `${id}-full`, sha256: imageHash, bytes: read.png, purpose: 'source', mime: 'image/png' },
    {
      id: `${id}-html`,
      sha256: sha(Buffer.from(read.source)),
      bytes: Buffer.from(read.source),
      purpose: 'source-dom',
      mime: 'text/plain'
    },
    {
      id: `${id}-text`,
      sha256: sha(Buffer.from(read.text)),
      bytes: Buffer.from(read.text),
      purpose: 'source-text',
      mime: 'text/plain'
    }
  ]
  const slices = []
  for (let y = 0, index = 0; y < read.cssHeight; index++) {
    const height = Math.min(tileHeight, read.cssHeight - y)
    const rect = { x: 0, y: y * viewport.dpr, width: info.width, height: height * viewport.dpr }
    const bytes = await original
      .clone()
      .extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height })
      .resize(viewport.width, height, { fit: 'fill', withoutEnlargement: true })
      .png()
      .toBuffer()
    const slice = {
      id: `${id}-slice-${index + 1}`,
      route,
      width: viewport.width,
      viewport,
      contentHash,
      captureHash: imageHash,
      imageHash: sha(bytes),
      rect,
      png: { width: viewport.width, height },
      role: 'readable',
      scale: 1 / viewport.dpr
    }
    slices.push(slice)
    pixels.push({ id: slice.id, sha256: slice.imageHash, bytes, purpose: 'readable', mime: 'image/png' })
    if (y + height === read.cssHeight) break
    y += height - overlap
    if (slices.length > 100) throw fail('QUALITY_CAPTURE_SLICES_LIMIT')
  }
  const overviewBytes = await original
      .clone()
      .resize({ width: 600, height: 1000, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer(),
    overviewInfo = await sharp(overviewBytes).metadata()
  const overview = {
    id: `${id}-overview`,
    route,
    width: viewport.width,
    viewport,
    contentHash,
    captureHash: imageHash,
    imageHash: sha(overviewBytes),
    role: 'overview-only',
    rect: { x: 0, y: 0, width: info.width, height: info.height },
    png: { width: overviewInfo.width, height: overviewInfo.height }
  }
  pixels.push({
    id: overview.id,
    sha256: overview.imageHash,
    bytes: overviewBytes,
    purpose: 'overview-only',
    mime: 'image/png'
  })
  const capture = {
    id,
    route,
    width: viewport.width,
    viewport,
    contentHash,
    imageHash,
    sourceId: `${id}-full`,
    sourceHtmlId: `${id}-html`,
    sourceFormat: 'html-as-inert-text',
    sourceTextId: `${id}-text`,
    sourceHash: sha(Buffer.from(read.source)),
    textHash: sha(Buffer.from(read.text)),
    png: { width: info.width, height: info.height },
    cssHeight: read.cssHeight,
    status: read.status,
    captureComplete: true,
    slices,
    overview,
    readiness: { fonts: true, images: true, lazy: true, render: true },
    errors: []
  }
  const validation = validateQualityCapture(capture)
  if (!validation.ok) throw fail(validation.errors[0])
  return { capture, pixels }
}

/** Gap checks use original PNG coordinates, including when DPR 2 derivatives are normalized. */
export function validateQualityCapture(capture) {
  const errors = [],
    c = capture,
    v = c?.viewport
  if (
    !pathOk(c?.route) ||
    !HASH.test(c?.contentHash ?? '') ||
    !HASH.test(c?.imageHash ?? '') ||
    !HASH.test(c?.sourceHash ?? '') ||
    !HASH.test(c?.textHash ?? '') ||
    ![1440, 390].includes(v?.width) ||
    ![1, 2].includes(v?.dpr) ||
    c.width !== v.width ||
    c.png?.width !== v.width * v.dpr ||
    c.png?.height !== c.cssHeight * v.dpr ||
    c.status !== 200 ||
    c.captureComplete !== true ||
    c.errors?.length !== 0 ||
    !['fonts', 'images', 'lazy', 'render'].every((key) => c.readiness?.[key] === true)
  )
    errors.push('QUALITY_CAPTURE_INVALID')
  const seen = new Set(),
    slices = [...(c?.slices ?? [])].sort((a, b) => a.rect?.y - b.rect?.y)
  let bottom = 0
  for (const s of slices) {
    const r = s.rect
    if (
      !s.id ||
      seen.has(s.id) ||
      !HASH.test(s.imageHash ?? '') ||
      s.captureHash !== c.imageHash ||
      s.contentHash !== c.contentHash ||
      s.route !== c.route ||
      s.width !== c.width ||
      qualityHash(s.viewport) !== qualityHash(v) ||
      s.role !== 'readable' ||
      !r ||
      ![r.x, r.y, r.width, r.height].every(Number.isInteger) ||
      r.x !== 0 ||
      r.y < 0 ||
      r.width !== c.png?.width ||
      r.height <= 0 ||
      r.y + r.height > c.png?.height ||
      r.y > bottom ||
      s.png?.width !== r.width / v?.dpr ||
      s.png?.height !== r.height / v?.dpr ||
      s.png?.width > 1440 ||
      s.png?.height > 1100 ||
      s.scale !== 1 / v?.dpr
    )
      errors.push('QUALITY_CAPTURE_SLICE_COVERAGE')
    seen.add(s.id)
    bottom = Math.max(bottom, (r?.y ?? 0) + (r?.height ?? 0))
  }
  if (!slices.length || bottom !== c?.png?.height) errors.push('QUALITY_CAPTURE_SLICE_GAP')
  return { ok: !errors.length, errors: [...new Set(errors)] }
}

export function qualityCaptureManifest({ accountId, contentHash, captures, requiredRoutes }) {
  const errors = [],
    keys = new Set()
  for (const c of captures) {
    errors.push(...validateQualityCapture(c).errors)
    const key = `${c.route}@${c.width}`
    if (keys.has(key) || !requiredRoutes.includes(c.route) || c.contentHash !== contentHash)
      errors.push('QUALITY_CAPTURE_SCOPE')
    keys.add(key)
  }
  for (const route of requiredRoutes)
    for (const viewport of QUALITY_VIEWPORTS)
      if (!keys.has(`${route}@${viewport.width}`))
        errors.push(`QUALITY_CAPTURE_MISSING:${route}@${viewport.width}`)
  const artifact = {
    schemaVersion: 'tracy-wo-render/v2',
    accountId,
    contentHash,
    captures,
    coverage: {
      routes: requiredRoutes,
      viewports: QUALITY_VIEWPORTS,
      captures: captures.length,
      slices: captures.reduce((n, c) => n + c.slices.length, 0),
      sharedChrome: 'each-route'
    },
    validation: { state: errors.length ? 'invalid' : 'validated', errors: [...new Set(errors)] }
  }
  return {
    ok: !errors.length,
    errors: artifact.validation.errors,
    artifact: { ...artifact, hash: qualityHash(artifact) }
  }
}

/** Contact sheets support the global coherence judgement; they never replace readable local coverage. */
export async function qualityOverviewSheets(captures, getPixels) {
  const groups = Array.from({ length: Math.ceil(captures.length / 4) }, (_, i) =>
    captures.slice(i * 4, i * 4 + 4)
  )
  if (!groups.length || groups.length > 6) throw fail('QUALITY_GLOBAL_OVERVIEW_LIMIT')
  const images = [],
    metadata = []
  for (const [index, group] of groups.entries()) {
    const cells = [],
      members = []
    for (const [cell, capture] of group.entries()) {
      const bytes = await getPixels(capture.overview.id)
      if (sha(bytes) !== capture.overview.imageHash) throw fail('QUALITY_CAPTURE_PIXELS_CHANGED')
      const thumb = await sharp(bytes)
        .resize({ width: 560, height: 560, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer()
      const info = await sharp(thumb).metadata(),
        x = (cell % 2) * 600,
        y = Math.floor(cell / 2) * 600
      cells.push({ input: thumb, left: x, top: y })
      members.push({
        route: capture.route,
        width: capture.width,
        captureHash: capture.imageHash,
        overviewHash: capture.overview.imageHash,
        rect: { x, y, width: info.width, height: info.height }
      })
    }
    const bytes = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: '#ffffff' } })
      .composite(cells)
      .png()
      .toBuffer()
    const imageHash = sha(bytes),
      id = `coherence-${index + 1}-${imageHash.slice(0, 12)}`
    images.push({ id, sha256: imageHash, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` })
    metadata.push({
      id,
      imageHash,
      role: 'coherence-overview-only',
      png: { width: 1200, height: 1200 },
      members
    })
  }
  return { images, metadata }
}
