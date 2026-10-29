/** Derive native image slots, retaining the existing selector, crop rules and source receipts. */
import { createHash } from 'node:crypto'
import { parseFragment } from 'parse5'
import { parseBlocks, namedBlocks, commentJson } from './wp-blocks.js'
import { parse as parseCss, walk as walkCss, generate as cssText } from 'css-tree'
import { cutForPlace, extendForPlace } from '../../lib/picture-cut.js'
import { substitutePicture } from '../../lib/substitute-picture.js'
import { fillPlacements, fillsByPlan } from './quickstart-fill-pictures.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { planQuickstartVariants } from './quickstart-picture-plan.js'
import { sizeOf } from './pictures.js'

const fail = (code) => Object.assign(new Error(code), { code })
const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const extension = /\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i
const PLACEHOLDER_MAX_W = 1600
/** What the picture planner calls a gap a neutral picture fills (`planQuickstartVariants`): a plan entry, not a site action. */
const GAP_ACTION = 'placeholder'
/** Review reason recorded when a slot no business photo fits holds a neutral placeholder. */
export const QUICKSTART_PLACEHOLDER_POLICY = 'quickstart-picture-placeholders/1'

/** Parse CSS URLs without treating punctuation inside a quoted URL as a separator. */
function cssUrls(value, context) {
  const ast = parseCss(value, { context })
  const urls = []
  walkCss(ast, {
    visit: 'Url',
    enter(node) {
      urls.push(node.value)
    }
  })
  return { ast, urls }
}
const mediaAttrs = new Set([
  'src',
  'srcset',
  'data-src',
  'data-srcset',
  'data-lazy-src',
  'data-lazy-srcset',
  'data-original'
])
const firstSource = (value) =>
  String(value ?? '')
    .trim()
    .split(/[,\s]+/)[0]
const htmlAttr = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')

/** Responsive, lazy and CSS images retain their existing DOM and presentation rules. */
export function responsivePictures(html) {
  const groups = []
  function visit(node, parentPicture = null, brand = false) {
    const attrs = Object.fromEntries((node.attrs ?? []).map((a) => [a.name, a.value]))
    const classes = (attrs.class ?? '').split(/\s+/)
    brand ||=
      classes.some((c) => ['wp-block-site-logo', 'custom-logo-link', 'custom-logo'].includes(c)) ||
      attrs.rel === 'icon'
    const pictureNode = node.tagName === 'picture' ? node : parentPicture
    if (node.tagName === 'img') {
      const nodes = pictureNode
        ? (pictureNode.childNodes ?? []).filter((n) => ['img', 'source'].includes(n.tagName))
        : [node]
      const file =
        attrs['data-src'] ??
        attrs['data-lazy-src'] ??
        attrs['data-original'] ??
        (attrs['data-srcset'] ? firstSource(attrs['data-srcset']) : null) ??
        attrs.src ??
        firstSource(
          attrs.srcset ??
            nodes.find((n) => n.tagName === 'source')?.attrs?.find((a) => a.name === 'srcset')?.value
        )
      if (file) groups.push({ file, nodes, image: node, role: brand ? 'brand' : 'content' })
    }
    if (node.tagName === 'picture' && !(node.childNodes ?? []).some((child) => child.tagName === 'img')) {
      const nodes = (node.childNodes ?? []).filter((child) => child.tagName === 'source')
      const source = nodes
        .flatMap((child) => child.attrs ?? [])
        .find((attr) => ['data-srcset', 'srcset'].includes(attr.name))
      if (source) groups.push({ file: firstSource(source.value), nodes, role: brand ? 'brand' : 'content' })
    }
    if (attrs.style)
      for (const file of cssUrls(attrs.style, 'declarationList').urls)
        groups.push({ file, nodes: [node], css: 'attribute', role: brand ? 'brand' : 'content' })
    if (node.tagName === 'style')
      for (const child of node.childNodes ?? [])
        if (child.nodeName === '#text') {
          for (const file of cssUrls(child.value, 'stylesheet').urls)
            groups.push({ file, nodes: [child], css: 'text', role: 'content' })
        }
    for (const child of node.childNodes ?? []) visit(child, pictureNode, brand)
  }
  visit(parseFragment(html, { sourceCodeLocationInfo: true }))
  return groups
}
export function replaceResponsivePicture(html, file, url, width, attachment = null, occurrence = null) {
  const edits = [],
    blocks = parseBlocks(html),
    patchedBlocks = new Set()
  for (const group of responsivePictures(html).filter(
    (g, index) => g.file === file && g.role !== 'brand' && (occurrence === null || index === occurrence)
  )) {
    const start =
      group.image?.sourceCodeLocation?.startOffset ?? group.nodes[0]?.sourceCodeLocation?.startOffset
    const patchBlock = (block) => {
      if (start < block.innerStart || start > block.innerEnd) return
      if (
        ['core/image', 'core/cover', 'core/media-text'].includes(block.name) &&
        block.attrs &&
        !patchedBlocks.has(block.start)
      ) {
        patchedBlocks.add(block.start)
        const rewrite = (value) => {
          if (Array.isArray(value)) return value.map(rewrite)
          if (!value || typeof value !== 'object') return value
          return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
              key,
              ['url', 'mediaUrl'].includes(key) && child === file ? url : rewrite(child)
            ])
          )
        }
        const attrs = rewrite(block.attrs)
        if (attachment && block.name === 'core/image') attrs.id = Number(attachment)
        const opening = html.slice(block.start, block.innerStart),
          a = opening.indexOf('{'),
          b = opening.lastIndexOf('}')
        if (a >= 0 && b >= a && JSON.stringify(attrs) !== JSON.stringify(block.attrs))
          edits.push({ start: block.start + a, end: block.start + b + 1, text: commentJson(attrs) })
      }
      for (const child of block.children ?? []) patchBlock(child)
    }
    if (blocks) patchBlock(blocks)
    for (const node of group.nodes) {
      if (group.css) {
        const attr = node.attrs?.find((a) => a.name === 'style')
        const value = group.css === 'text' ? node.value : attr.value
        const { ast } = cssUrls(value, group.css === 'text' ? 'stylesheet' : 'declarationList')
        walkCss(ast, {
          visit: 'Url',
          enter(part) {
            if (part.value === file) part.value = url
          }
        })
        const where = group.css === 'text' ? node.sourceCodeLocation : node.sourceCodeLocation.attrs.style
        edits.push({
          start: where.startOffset,
          end: where.endOffset,
          text: group.css === 'text' ? cssText(ast) : `style="${htmlAttr(cssText(ast))}"`
        })
        continue
      }
      for (const attr of node.attrs ?? []) {
        const where = node.sourceCodeLocation?.attrs?.[attr.name]
        if (where && attr.name === 'class' && attachment) {
          const value = attr.value.replace(/\bwp-image-\d+\b/g, `wp-image-${Number(attachment)}`)
          if (value !== attr.value)
            edits.push({ start: where.startOffset, end: where.endOffset, text: `class="${htmlAttr(value)}"` })
          continue
        }
        if (!where || (!mediaAttrs.has(attr.name) && attr.name !== 'type')) continue
        const value = attr.name.includes('srcset')
          ? `${url} ${width}w`
          : attr.name === 'type'
            ? 'image/jpeg'
            : url
        edits.push({
          start: where.startOffset,
          end: where.endOffset,
          text: `${attr.name}="${htmlAttr(value)}"`
        })
      }
    }
  }
  let result = html
  for (const edit of [...new Map(edits.map((e) => [e.start, e])).values()].sort((a, b) => b.start - a.start))
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  return result
}

export async function nativePictureSlots({ adapter, ctx, reader, frames = [] }) {
  const slots = [],
    unresolved = [],
    excluded = []
  function visit(record, value, path) {
    const label = `${record.key} ${path.join(' ')}`
    const declaredRole = record.mediaBindings?.find(
      (binding) => !binding.block && JSON.stringify(binding.path) === JSON.stringify(path)
    )?.role
    if (['logo', 'favicon', 'icon', 'avatar'].includes(declaredRole)) {
      excluded.push({ record: record.key, path, reason: declaredRole })
      return
    }
    if (value && typeof value === 'object' && value.id && (value.provider || value.mimeType)) {
      const file =
        value.src ?? (value.meta?.storageKey ? `/_emdash/api/media/file/${value.meta.storageKey}` : null)
      if (file) slots.push({ record, path, file, label, object: true })
    } else if (
      typeof value === 'string' &&
      extension.test(value) &&
      !/<[a-z]/i.test(value) &&
      !/\s/.test(value)
    )
      slots.push({ record, path, file: value.split('#')[0], label })
    else if (typeof value === 'string' && /<img|<source|background|url\(|<!-- wp:site-logo/i.test(value)) {
      if (/<!-- wp:site-logo(?:\s|\/|>)/.test(value))
        excluded.push({ record: record.key, path, reason: 'brand', writerTarget: 'wordpress:site_logo' })
      const blocks = parseBlocks(value)
      for (const [occurrence, group] of responsivePictures(value).entries()) {
        const start =
          group.image?.sourceCodeLocation?.startOffset ?? group.nodes[0]?.sourceCodeLocation?.startOffset
        const role =
          blocks &&
          record.mediaBindings?.find(
            (binding) =>
              binding.block &&
              JSON.stringify(binding.path) === JSON.stringify(path) &&
              namedBlocks(blocks, binding.block).some(
                (block) => start >= block.innerStart && start <= block.innerEnd
              )
          )?.role
        if (['logo', 'favicon', 'icon', 'avatar'].includes(role))
          excluded.push({ record: record.key, path, reason: role })
        else if (group.role === 'brand') excluded.push({ record: record.key, path, reason: 'brand' })
        else if (extension.test(group.file))
          slots.push({ record, path, file: group.file, label, html: true, occurrence })
        else if (!group.file.startsWith('data:'))
          unresolved.push({ record: record.key, path, reason: 'unsupported-image-reference' })
      }
    } else if (Array.isArray(value)) value.forEach((child, n) => visit(record, child, [...path, n]))
    else if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value))
        if (!/^_|id$|guid|url|href|link/i.test(key)) visit(record, child, [...path, key])
  }
  for (const record of adapter.records) {
    const paths = record.picturePaths ?? record.bindings?.map((binding) => binding.path) ?? []
    for (const path of new Map(paths.map((item) => [JSON.stringify(item), item])).values())
      visit(record, adapter.get(record.data, path), path)
    if (
      ctx.platform === 'wordpress' &&
      (record.restBase || ['post', 'page'].includes(record.data.post_type))
    ) {
      const postType = record.restBase ?? (record.data.post_type === 'page' ? 'pages' : 'posts')
      const rest = JSON.parse(await reader.text(`/wp-json/wp/v2/${postType}/${record.identity.id}?_embed`))
      const media = rest._embedded?.['wp:featuredmedia']?.[0]
      if (rest.featured_media && media?.source_url)
        slots.push({
          record,
          path: ['featured_image_id'],
          file: media.source_url,
          label: `${record.key} featured intro`,
          featured: true,
          originalId: rest.featured_media
        })
    }
  }
  const domain = await websiteOpportunitiesDomain(),
    groups = [],
    bindings = new Map()
  for (const slot of slots) {
    let file, sourceOrigin
    try {
      const base = new URL(reader.base ?? 'http://site.invalid')
      const url = new URL(slot.file, base)
      if (url.origin !== base.origin) {
        unresolved.push({ record: slot.record.key, path: slot.path, reason: 'external-image-reference' })
        continue
      }
      sourceOrigin = url.origin
      file = url.pathname + url.search
    } catch {
      continue
    }
    const bytes = await reader.bytes(file),
      size = bytes ? await sizeOf(Buffer.from(bytes)) : null
    if (!size) {
      unresolved.push({ record: slot.record.key, path: slot.path, reason: 'image-unreadable' })
      continue
    }
    const role = /hero|slideshow/.test(slot.label)
      ? 'hero'
      : /gallery/.test(slot.label)
        ? 'gallery'
        : /about|intro|featured/.test(slot.label)
          ? 'section-main'
          : 'article'
    const observedFrames = frames.filter((f) => '/' + String(f.path).replace(/^\//, '') === file)
    const routes = [
      ...new Set(
        [
          ...(slot.record.renderRoutes ?? slot.record.routes ?? []),
          ...observedFrames.map((f) => f.route).filter(Boolean)
        ].map((route) =>
          route.startsWith('?') ? route : new URL(route, reader.base ?? 'http://site.invalid').pathname
        )
      )
    ]
    const frame = observedFrames
      .filter((f) => f.width > 0 && f.height > 0)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0]
    const aspect = frame ? frame.width / frame.height : size[0] / size[1]
    const outputWidth = frame ? Math.min(size[0], Math.ceil(frame.width * 2)) : size[0]
    const kind = slot.object ? 'object' : slot.featured ? 'featured' : slot.html ? 'html' : 'string'
    const id = digest({ sourceOrigin, file, role, aspect, outputWidth, kind })
    const occurrence = {
      key: digest({ record: slot.record.key, path: slot.path, occurrence: slot.occurrence ?? null }),
      routes,
      entity: slot.record.key
    }
    const existing = bindings.get(id)
    if (existing) {
      if (
        !existing.aliases.some(
          (alias) =>
            alias.record.key === slot.record.key &&
            JSON.stringify(alias.path) === JSON.stringify(slot.path) &&
            alias.occurrence === slot.occurrence
        )
      )
        existing.aliases.push(slot)
      const group = groups.find((item) => item.id === id)
      group.routes = [...new Set([...group.routes, ...routes])]
      group.home ||= routes.includes('/')
      group.occurrences.push(occurrence)
      group.topic = [...new Set([...group.topic, ...(domain.foldWords?.(slot.label) ?? [])])]
      group.words = [...new Set([...group.words, ...(domain.foldWords?.(slot.label) ?? [])])]
      continue
    }
    groups.push({
      id,
      file,
      role,
      demo: { width: outputWidth, height: Math.round(outputWidth / aspect) },
      routes: routes.length ? routes : [`?${slot.record.key}`],
      home: routes.includes('/'),
      topic: domain.foldWords?.(slot.label) ?? [],
      aspect,
      occurrences: [occurrence],
      words: domain.foldWords?.(slot.label) ?? []
    })
    bindings.set(id, { ...slot, aliases: [slot] })
  }
  // An unproved location can share a page with every known group, never a private synthetic page.
  const knownRoutes = [
    ...new Set(groups.flatMap((group) => group.routes).filter((route) => !route.startsWith('?')))
  ]
  for (const group of groups)
    if (group.routes.some((route) => route.startsWith('?'))) {
      group.routes = [...knownRoutes, '?unknown-route']
      group.home = knownRoutes.includes('/')
    }
  return { groups, bindings, unresolved, excluded }
}

export async function placeNativePictures({
  adapter,
  ctx,
  reader,
  real,
  checkpoint,
  frames = [],
  priorUploads = [],
  inventory = null,
  fill = null
}) {
  const { groups, bindings, unresolved, excluded } =
    inventory ??
    (await nativePictureSlots({
      adapter,
      ctx,
      reader,
      frames
    }))
  if (unresolved.length) throw fail('QUICKSTART_PICTURE_COVERAGE_INCOMPLETE')
  if (!groups.length) throw fail('QUICKSTART_PICTURE_COVERAGE_EMPTY')
  // Bytes are read only for the photos a plan places (item 27): reading all 300 stored photos before planning cost
  // minutes of the write clock for photos no slot takes. A chosen photo whose bytes are gone is set aside and the plan is
  // made again without it; a photo whose bytes do not match its hash still stops the build.
  const domain = await websiteOpportunitiesDomain(),
    unavailable = [],
    sourceBytes = new Map()
  let available = [...real.pictures]
  const planWith = () => {
    const labels = available.map((p) => ({
      ...domain.labelPicture(p),
      visionTextPresence: p.vision?.textPresence ?? null
    }))
    const { clusterOf } = domain.nearCopies(labels)
    // A v3 content map and a brief that links its photos: the fill plan decides each mapped slot (#141).
    const byFill =
      fill && fillsByPlan(fill.contentMap, fill.brief)
        ? fillPlacements({
            contentMap: fill.contentMap,
            brief: fill.brief,
            pictures: available,
            groups,
            cardNames: fill.cardNames ?? {}
          })
        : null
    const rest = byFill ? byFill.rest : groups
    const variants = rest.length
      ? planQuickstartVariants(domain, { groups: rest, labels, clusterOf })
      : { placements: [], unfilled: [] }
    const plan = byFill
      ? {
          ...variants,
          placements: [...byFill.placements, ...variants.placements],
          unfilled: [
            ...byFill.substitutes.map((s) => ({
              groupId: s.groupId,
              action: GAP_ACTION,
              code: s.code,
              ...(s.substitute ? { substitute: s.substitute } : {})
            })),
            ...(variants.unfilled ?? [])
          ],
          fill: fillReport(byFill)
        }
      : variants
    return { plan, byFill }
  }
  let plan, byFill
  for (;;) {
    ;({ plan, byFill } = planWith())
    let missing = false
    for (const placement of plan.placements ?? []) {
      if (placement.placeholder || !placement.mediaId || sourceBytes.has(placement.mediaId)) continue
      ctx.signal?.throwIfAborted()
      const picture = available.find((p) => p.id === placement.mediaId)
      if (!picture) continue
      const bytes = await real.bytes(picture.id)
      if (!bytes) {
        unavailable.push(picture.id)
        available = available.filter((p) => p.id !== picture.id)
        missing = true
        continue
      }
      if (createHash('sha256').update(bytes).digest('hex') !== picture.sha256)
        throw fail('QUICKSTART_PICTURE_SOURCE')
      sourceBytes.set(picture.id, bytes)
    }
    if (!missing) break
  }
  await checkpoint('picture-plan', { state: 'planned', plan })
  // Replace, never remove: a slot no photo fits keeps its place and holds a neutral picture.
  const gaps = plan.unfilled ?? []
  const work = [
    ...plan.placements,
    ...gaps.map((missing) => ({
      groupId: missing.groupId,
      mediaId: null,
      placeholder: true,
      substitute: missing.substitute ?? null
    }))
  ]
  const changed = new Map(),
    receipts = [],
    uploadedCuts = new Map(
      priorUploads
        .filter((r) => r.state === 'verified' && r.uploaded?.ok && r.derivativeHash)
        .map((r) => [r.derivativeHash, r.uploaded])
    )
  for (const placement of work) {
    ctx.signal?.throwIfAborted()
    const slot = bindings.get(placement.groupId),
      group = groups.find((item) => item.id === placement.groupId),
      source = placement.placeholder ? null : real.pictures.find((p) => p.id === placement.mediaId)
    if (!slot || !group || (!placement.placeholder && !source)) throw fail('QUICKSTART_PICTURE_SCOPE')
    let cut
    if (placement.placeholder) {
      const scale = Math.min(1, PLACEHOLDER_MAX_W / group.demo.width)
      // A person's initials, a signer's name, a blank or the plain placeholder (`substitute-picture.js`).
      cut = await substitutePicture({
        substitute: placement.substitute,
        width: Math.max(1, Math.round(group.demo.width * scale)),
        height: Math.max(1, Math.round(group.demo.height * scale)),
        colours: real.colours ?? []
      })
      cut.recipe = { version: 'tracy-placeholder/1', kind: cut.kind, width: cut.width, height: cut.height }
    } else {
      const raw = sourceBytes.get(source.id) ?? (await real.bytes(source.id))
      if (!raw || createHash('sha256').update(raw).digest('hex') !== source.sha256)
        throw fail('QUICKSTART_PICTURE_SOURCE')
      cut = placement.canvas
        ? await extendForPlace(raw, placement.crop, placement.canvas)
        : await cutForPlace(raw, placement.crop)
    }
    const kind = placement.placeholder ? cut.kind : 'photo'
    const path = `${ctx.platform === 'joomla' ? 'images' : ctx.platform === 'wordpress' ? 'wp-content/uploads' : 'tracy-content'}/tracy-quickstart/${cut.sha256}.${cut.ext}`
    let uploaded = uploadedCuts.get(cut.sha256)
    if (!uploaded) {
      await checkpoint(`upload:${placement.groupId}`, {
        state: 'sending',
        kind,
        sourceId: source?.id ?? null,
        derivativeHash: cut.sha256,
        path
      })
      uploaded = await adapter.call('media.upload', {
        apply_id: `qs-photo-${cut.sha256.slice(0, 24)}`,
        path,
        content_b64: cut.bytes.toString('base64')
      })
    }
    if (!uploaded?.ok || !(uploaded.path || uploaded.url || uploaded.id || uploaded.attachment))
      throw fail('QUICKSTART_PICTURE_UPLOAD')
    let value = uploaded.path ?? uploaded.url ?? path
    let readbackPath
    if (slot.object) {
      const media = await adapter.api('GET', `/_emdash/api/media/${uploaded.id}`),
        item = media.item ?? media
      if (item.contentHash !== `sha1:${createHash('sha1').update(cut.bytes).digest('hex')}`)
        throw fail('QUICKSTART_PICTURE_READBACK')
      readbackPath = `/_emdash/api/media/file/${item.storageKey}`
      value = {
        id: uploaded.id,
        provider: 'local',
        src: `/_emdash/api/media/file/${item.storageKey}`,
        meta: { storageKey: item.storageKey },
        width: cut.width,
        height: cut.height,
        alt: source?.vision?.oneLine ?? '',
        mimeType: 'image/jpeg'
      }
    } else {
      const uploadedPath = new URL(uploaded.url ?? uploaded.path ?? path, reader.base).pathname
      readbackPath = uploadedPath
      const readback = await reader.bytes(uploadedPath)
      if (!readback || createHash('sha256').update(readback).digest('hex') !== cut.sha256)
        throw fail('QUICKSTART_PICTURE_READBACK')
    }
    await checkpoint(`upload:${placement.groupId}`, {
      state: 'verified',
      kind,
      sourceId: source?.id ?? null,
      derivativeHash: cut.sha256,
      readbackPath,
      uploaded
    })
    uploadedCuts.set(cut.sha256, uploaded)
    for (const alias of slot.aliases ?? [slot]) {
      const data = changed.get(alias.record.key) ?? structuredClone(alias.record.data)
      let replacement = value
      if (alias.featured) replacement = Number(uploaded.attachment ?? uploaded.id)
      if (alias.html) {
        const old = adapter.get(data, alias.path)
        const url = /^(?:https?:|\/)/.test(value) ? value : '/' + value
        replacement = replaceResponsivePicture(
          old,
          alias.file,
          url,
          cut.width,
          uploaded.attachment,
          alias.occurrence
        )
      }
      adapter.set(data, alias.path, replacement)
      changed.set(alias.record.key, data)
      receipts.push({
        recordKey: alias.record.key,
        featured: alias.featured === true,
        kind,
        caption: source?.vision?.oneLine ?? null,
        key: placement.groupId,
        sourceId: source?.id ?? null,
        sourceCluster: source ? (placement.sourceCluster ?? source.id) : null,
        sourceUses: source ? (placement.totalUses ?? 1) : 0,
        pageUses: source ? (placement.pageUses ?? 1) : 0,
        recipe: cut.recipe,
        sourceHash: source?.sha256 ?? null,
        derivativeHash: cut.sha256,
        readbackPath,
        uploaded
      })
    }
  }
  for (const [key, data] of changed)
    await adapter.write(
      adapter.records.find((r) => r.key === key),
      data,
      (receipt) => checkpoint(`photo:${key}`, receipt)
    )
  const report = {
    unavailable,
    excluded,
    unresolved,
    picturePolicy: real.picturePolicy ?? null,
    generation: 'real-only',
    variantPolicy: plan.variantPolicy ?? null,
    // A placeholder is never a finished picture: the build waits for a person.
    requiresReview: plan.requiresReview === true || gaps.length > 0,
    placeholderPolicy: gaps.length ? QUICKSTART_PLACEHOLDER_POLICY : null,
    vision: real.vision ?? null,
    placed: receipts.filter((receipt) => receipt.kind === 'photo').length,
    // An initials avatar, a script signature and a blank stand where no photo went: each counts as a placeholder.
    placeholders: receipts.filter((receipt) => receipt.kind !== 'photo').length,
    originalGroups: groups.length,
    sourceCount: new Set(receipts.filter((r) => r.kind === 'photo').map((r) => r.sourceId)).size,
    derivatives: uploadedCuts.size,
    reusedGroups: plan.placements.filter((placement) => placement.reused).length,
    maxSourceUses: Math.max(0, ...plan.placements.map((placement) => placement.totalUses ?? 1)),
    gaps,
    receipts,
    // The fill plan's decisions with their reason codes, for the hand-off, and what the QA judges each photo by.
    ...(byFill ? { fill: plan.fill, qaEvidence: qaEvidenceOf(byFill, receipts) } : {})
  }
  await checkpoint('pictures', { state: 'verified', report })
  return report
}

/** The fill plan as the hand-off keeps it: every image decision with its reason code, and each card's binding. */
function fillReport({ fill, kept }) {
  return {
    version: fill.version,
    offerings: fill.offerings,
    people: fill.people,
    decisions: fill.slots
      .filter((d) => d.type === 'image')
      .map((d) => ({
        key: d.key,
        role: d.role,
        groupId: d.groupId,
        action: d.action,
        reason: d.reason,
        ...(d.mediaId ? { mediaId: d.mediaId } : {}),
        ...(d.substitute ? { substitute: d.substitute.kind } : {}),
        ...(d.refused && Object.keys(d.refused).length ? { refused: d.refused } : {})
      })),
    unused: fill.unused,
    kept
  }
}

/**
 * What the post-build checks `photos-match-slots` and `faces-named` (#140) judge each placed photo by: its file, its
 * brief photo, and the slot's role, group kind and the offering or person the fill plan bound it to. The template
 * pictures the plan keeps are named so `no-demo-pictures` reads them as kept on purpose.
 */
function qaEvidenceOf({ slotOf, kept }, receipts) {
  const placedSlots = {}
  for (const receipt of receipts) {
    const slot = slotOf.get(receipt.key)
    if (receipt.kind !== 'photo' || !receipt.sourceId || !slot) continue
    const path = String(receipt.readbackPath ?? '').replace(/^\/+/, '')
    if (!path) continue
    placedSlots[path] = {
      photo: receipt.sourceId,
      slot: slot.key,
      ...(slot.role ? { role: slot.role } : {}),
      ...(slot.group ? { group: slot.group } : {}),
      ...(slot.offering ? { offering: slot.offering } : {}),
      ...(slot.person ? { person: slot.person } : {})
    }
  }
  return { placedSlots, kept }
}
