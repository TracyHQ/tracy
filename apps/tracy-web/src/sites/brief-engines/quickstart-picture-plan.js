const DECORATIVE = new Set(['hero', 'banner', 'background', 'section-main', 'cta'])

/** A real, sharp foreground over its own blurred background, only when a wide crop cannot fit. */
function canvasFit(domain, group, label, clusterOf) {
  const aspect = group.demo.width / group.demo.height
  if (
    !DECORATIVE.has(group.role) ||
    aspect < 2 ||
    aspect <= label.aspect ||
    label.subjectFrom !== 'vision' ||
    label.quality !== 'good' ||
    label.visionTextPresence !== 'absent' ||
    label.textPresence !== 'absent' ||
    label.graphic ||
    label.collage ||
    ['logo', 'poster', 'menu-board', 'unknown', 'other'].includes(label.subject)
  )
    return null
  const role = domain.ROLES[group.role]
  const output = domain.outputSize(
    { width: Math.min(group.demo.width, label.width * 2), height: label.height },
    aspect,
    group.demo.width
  )
  if (!output) return null
  // Keep the full source where possible; otherwise crop only enough to occupy half the canvas.
  const foreground = {
    width: Math.min(
      output.width,
      Math.max(Math.ceil(output.width / 2), Math.round(output.height * label.aspect))
    ),
    height: output.height
  }
  const fit = domain.planPlacement({ groups: [{ ...group, demo: foreground }], labels: [label], clusterOf })
    .placements[0]
  if (!fit) return null
  const clear = fit.crop.output
  const minimum = Math.min(group.demo.width, role.min) / domain.MAX_SCALE
  if (
    fit.crop.source.width < minimum ||
    clear.width / output.width < 0.5 ||
    clear.height !== output.height ||
    clear.width > fit.crop.source.width ||
    clear.height > fit.crop.source.height
  )
    return null
  return {
    ...fit,
    canvas: {
      version: 1,
      minimumSourceWidth: minimum,
      output,
      foreground: {
        left: Math.floor((output.width - clear.width) / 2),
        top: 0,
        ...clear
      }
    },
    why: `${fit.why}; source canvas extension, sharp foreground and blurred source background`
  }
}

/** Preserve the strict match first, then fill remaining demo groups from fitting source variants. */
export function planQuickstartVariants(domain, { groups, labels, clusterOf = new Map() }) {
  const plan = domain.planPlacement({ groups, labels, clusterOf })
  if (!plan.unfilled.length) return plan
  const placements = [...plan.placements],
    unfilled = []
  const byId = new Map(groups.map((group) => [group.id, group]))
  const identity = (id) => (clusterOf.has(id) ? `cluster:${clusterOf.get(id)}` : `media:${id}`)
  const overlap = (a, b) => a.routes.some((route) => b.routes.includes(route))
  const uses = (id, group = null) =>
    placements.filter(
      (p) => identity(p.mediaId) === identity(id) && (!group || overlap(group, byId.get(p.groupId)))
    ).length
  for (const missing of plan.unfilled) {
    const group = byId.get(missing.groupId)
    const candidates = labels
      .flatMap((label) => {
        // A single-group strict plan retains subject, graphic, quality, crop and resolution checks.
        const fit = domain.planPlacement({ groups: [group], labels: [label], clusterOf }).placements[0]
        return fit ? [{ fit, pageUses: uses(label.id, group), totalUses: uses(label.id) }] : []
      })
      .sort(
        (a, b) =>
          a.pageUses - b.pageUses ||
          a.totalUses - b.totalUses ||
          b.fit.score - a.fit.score ||
          String(a.fit.mediaId).localeCompare(String(b.fit.mediaId))
      )
    const choice =
      candidates[0] ??
      labels
        .flatMap((label) => {
          const fit = canvasFit(domain, group, label, clusterOf)
          return fit ? [{ fit, pageUses: uses(label.id, group), totalUses: uses(label.id) }] : []
        })
        .sort(
          (a, b) =>
            a.pageUses - b.pageUses ||
            a.totalUses - b.totalUses ||
            b.fit.score - a.fit.score ||
            String(a.fit.mediaId).localeCompare(String(b.fit.mediaId))
        )[0]
    if (!choice) {
      unfilled.push(missing)
      continue
    }
    placements.push({
      ...choice.fit,
      reused: choice.totalUses > 0,
      why: `${choice.fit.why}; source variant for this demo position`
    })
  }
  const reviewed = placements.map((p) => ({
    ...p,
    sourceCluster: identity(p.mediaId),
    routes: byId.get(p.groupId).routes,
    pageUses: uses(p.mediaId, byId.get(p.groupId)),
    totalUses: uses(p.mediaId)
  }))
  return {
    ...plan,
    placements: reviewed,
    unfilled,
    unused: labels.filter((l) => !placements.some((p) => p.mediaId === l.id)).map((l) => l.id),
    variantPolicy: 'quickstart-source-variants/1',
    requiresReview: true
  }
}
