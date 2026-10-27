/** The QS Inventory screen: the warm stock, its pools, instances, refill timer and their dialogs. */
export const NS = 'cms-inventory'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = ['cms/Inventory.tsx', 'cms/inventory-api.ts', 'cms/inventory-read-state.ts'] as const

export const en = {
  'cms-inventory.ago.justNow': 'just now',
  'cms-inventory.ago.minutesShort': '{n}m ago',
  'cms-inventory.ago.hoursShort': '{n}h ago',
  'cms-inventory.ago.daysShort': '{n}d ago',
  'cms-inventory.ago.never': 'never',
  'cms-inventory.unit.seconds_one': '{count} second',
  'cms-inventory.unit.seconds_other': '{count} seconds',
  'cms-inventory.unit.minutes_one': '{count} minute',
  'cms-inventory.unit.minutes_other': '{count} minutes',
  'cms-inventory.agoWords.seconds_one': '{count} second ago',
  'cms-inventory.agoWords.seconds_other': '{count} seconds ago',
  'cms-inventory.agoWords.minutes_one': '{count} minute ago',
  'cms-inventory.agoWords.minutes_other': '{count} minutes ago',
  'cms-inventory.agoWords.hours_one': '{count} hour ago',
  'cms-inventory.agoWords.hours_other': '{count} hours ago',
  'cms-inventory.agoWords.days_one': '{count} day ago',
  'cms-inventory.agoWords.days_other': '{count} days ago',
  'cms-inventory.sweep.title': 'Refill timer',
  'cms-inventory.sweep.runsEvery': 'runs every',
  'cms-inventory.sweep.seconds': 'seconds',
  'cms-inventory.sweep.runsEveryPeriod': 'runs every {period}',
  'cms-inventory.sweep.save': 'Save',
  'cms-inventory.sweep.cancel': 'Cancel',
  'cms-inventory.sweep.change': 'Change',
  'cms-inventory.sweep.notRunYet': 'has not run yet',
  'cms-inventory.sweep.running': 'running since {ago}',
  'cms-inventory.sweep.lastRun': 'last run {ago}',
  'cms-inventory.sweep.lastRunTook': 'last run {ago}, took {duration}',
  'cms-inventory.sweep.underSecond': 'under a second',
  'cms-inventory.sweep.late': ' — late: the timer may not be running',
  'cms-inventory.sweep.nothingToDo': 'nothing to do',
  'cms-inventory.sweep.did.queued': '{n} queued',
  'cms-inventory.sweep.did.started': '{n} started',
  'cms-inventory.sweep.did.ready': '{n} became ready',
  'cms-inventory.sweep.did.retired': '{n} removed',
  'cms-inventory.sweep.did.failed': '{n} failed',
  'cms-inventory.sweep.explain':
    'Each run finishes teardowns, counts every pool in service against its floor, and starts the installs that are missing. A new period reaches the timer on its next run — no restart.',
  'cms-inventory.sweep.changedBy': ' Last changed by {who}.',
  'cms-inventory.neck.paused': 'paused — {reason}',
  'cms-inventory.neck.noReason': 'no reason given',
  'cms-inventory.neck.off': 'switched off',
  'cms-inventory.neck.atMax': 'at max stock',
  'cms-inventory.neck.oneAtATime': 'building one at a time',
  'cms-inventory.neck.review': 'waiting for review',
  'cms-inventory.refusal.noAnswer': 'No answer from this deployment.',
  'cms-inventory.refusal.hostUnreachable':
    'Could not reach {host} — nothing was changed. The site is still there.',
  'cms-inventory.refusal.theHost': 'the host',
  'cms-inventory.refusal.theHostStart': 'The host',
  'cms-inventory.refusal.teardownRefused': '{host} refused the teardown — nothing was changed.',
  'cms-inventory.refusal.teardownRefusedDetail':
    '{host} refused the teardown ({detail}) — nothing was changed.',
  'cms-inventory.refusal.hasOwner': 'A customer holds this one, so it was left alone.',
  'cms-inventory.refusal.forbidden': 'This deployment refused the request — nothing was changed.',
  'cms-inventory.refusal.noAnswerUnchanged': 'No answer from this deployment — nothing was changed.',
  'cms-inventory.refusal.revisionConflict':
    'Somebody else changed this pool while you were editing. Reload and try again.',
  'cms-inventory.refusal.notEligible': 'No demo install has vouched for this release yet.',
  'cms-inventory.refusal.poolPaused': 'This pool is paused — unpause it first.',
  'cms-inventory.approval.hashMismatch':
    'What was read back from this instance changed after you opened it — nothing was approved. Close this and review it again.',
  'cms-inventory.approval.notAwaiting':
    'This instance is no longer waiting for review — nothing was approved.',
  'cms-inventory.approval.notAwaitingState':
    'This instance is no longer waiting for review (it is {state}) — nothing was approved.',
  'cms-inventory.approval.notFound': 'This deployment does not know this instance — nothing was approved.',
  'cms-inventory.approval.refused': 'This deployment refused the request — nothing was approved.',
  'cms-inventory.approval.notReleased':
    'The instance was not released to ready. The generation may be approved all the same — reload to see where it stands.',
  'cms-inventory.approval.notConfirmed':
    'This deployment did not confirm the approval. It may or may not have been applied — reload to see where the instance stands.',
  'cms-inventory.approval.doneAlready':
    '{label} is released to ready. Generation {short} was already approved, so it rode on that approval.',
  'cms-inventory.approval.done':
    '{label} is released to ready, and generation {short} is approved: later builds of it reach ready on the machine check alone.',
  'cms-inventory.row.opensNewTab': 'opens in a new tab',
  'cms-inventory.row.notBuilt': 'not built yet',
  'cms-inventory.row.noAddress': 'no address',
  'cms-inventory.row.healthStale': 'health stale',
  'cms-inventory.row.staleTip':
    'Checked {ago}, past this pool’s {ttl} window — it is not counted as ready and will not be handed to a customer.',
  'cms-inventory.row.checked': 'checked {ago}',
  'cms-inventory.row.tries': '{n}/{max} tries',
  'cms-inventory.row.approve': 'Approve',
  'cms-inventory.row.tip.settling':
    'An approval of this instance was answered. It can be reviewed again once the inventory has been read again.',
  'cms-inventory.row.tip.reviewable':
    'Shows what was read back from this instance, then approves its generation and moves it to ready.',
  'cms-inventory.row.tip.reserved': 'A customer holds this one, so it is not approved from here.',
  'cms-inventory.row.tip.nothing':
    'Nothing was read back from this instance, so there is nothing to approve it against.',
  'cms-inventory.row.quarantine': 'Quarantine',
  'cms-inventory.row.quarantineTip':
    'Takes it out of the pool but leaves the site running, so you can open it and see what went wrong.',
  'cms-inventory.row.remove': 'Remove',
  'cms-inventory.row.removeTip':
    'Tears the site down on the host — container, volume, port and webroot — and frees the disk. It cannot be undone.',
  'cms-inventory.policy.floor': 'Floor',
  'cms-inventory.policy.floorHint': '(refill below)',
  'cms-inventory.policy.target': 'Target',
  'cms-inventory.policy.ceiling': 'Ceiling',
  'cms-inventory.policy.atOnce': 'At once',
  'cms-inventory.policy.tries': 'Tries',
  'cms-inventory.policy.healthTtl': 'Health TTL (seconds)',
  'cms-inventory.policy.inService': 'In service',
  'cms-inventory.policy.reviewHold': 'Hold for review',
  'cms-inventory.policy.paused': 'Paused',
  'cms-inventory.policy.pausedPlaceholder': 'why it is paused',
  'cms-inventory.policy.save': 'Save thresholds',
  'cms-inventory.screen.unreadable': 'Could not read the inventory.',
  'cms-inventory.screen.title': 'QS Inventory',
  'cms-inventory.screen.intro':
    'CMS instances built before a customer asks for one. A pool is one exact build — environment, host, CMS, release and the checksum of what gets installed — so the same tag published twice is two pools.',
  'cms-inventory.screen.refresh': 'Refresh',
  'cms-inventory.screen.listUnconfirmed':
    'The inventory could not be read again. Every count shown may be from before the last change and is not confirmed.',
  'cms-inventory.screen.poolsUnconfirmed_one':
    'The instances of {pools} could not be read again. What is known of that pool may be from before the last change and is not confirmed.',
  'cms-inventory.screen.poolsUnconfirmed_other':
    'The instances of {pools} could not be read again. What is known of those pools may be from before the last change and is not confirmed.',
  'cms-inventory.screen.reload': 'Reload',
  'cms-inventory.screen.empty':
    'Nothing stocked for {cms} yet. A pool is created from a quickstart that has a successful demo install to vouch for it.',
  'cms-inventory.screen.emptyOther':
    'Nothing stocked for {cms} yet — another CMS has pools; the picker above switches between them. A pool is created from a quickstart that has a successful demo install to vouch for it.',
  'cms-inventory.pool.generationTip':
    'Generation — a checksum of the parts installed, the contract and the verifier. A new one means a new pool with default thresholds.',
  'cms-inventory.pool.readyOf': '/ {target} ready',
  'cms-inventory.pool.building': '{n} building',
  'cms-inventory.pool.quarantined': '{n} quarantined',
  'cms-inventory.pool.twoPools':
    '{n} pools carry <b>{tag}</b> — a publish changed the build, and thresholds do not carry across. Set them again here, and empty the pool you no longer want.',
  'cms-inventory.pool.summary':
    'floor {floor} · target {target} · ceiling {ceiling} · {atOnce} at once · health {ttl}',
  'cms-inventory.pool.atCeiling': 'Already at the ceiling ({stock}/{max}). Raise it first.',
  'cms-inventory.pool.queued': 'Queued {n} — the next run builds it, within about {period}.',
  'cms-inventory.pool.buildOne': 'Build one',
  'cms-inventory.pool.clearStuck': 'Clear {n} stuck',
  'cms-inventory.pool.close': 'Close',
  'cms-inventory.pool.thresholds': 'Thresholds',
  'cms-inventory.pool.unreadable': 'This pool could not be read.',
  'cms-inventory.pool.reading': 'Reading this pool…',
  'cms-inventory.pool.empty': 'Nothing in this pool yet.',
  'cms-inventory.pool.showRemoved': 'Show {n} removed',
  'cms-inventory.pool.hideRemoved': 'Hide {n} removed',
  'cms-inventory.eligible.title': 'Not stocked yet',
  'cms-inventory.eligible.intro':
    'A quickstart may be stocked once a demo install has vouched for the exact release.',
  'cms-inventory.eligible.created':
    'Pool created for {tag}. It is switched off until you set its thresholds.',
  'cms-inventory.eligible.failed': 'Could not stock {tag}: {why}',
  'cms-inventory.eligible.stock': 'Stock this',
  'cms-inventory.clear.title_one': 'Clear {count} stuck instance?',
  'cms-inventory.clear.title_other': 'Clear {count} stuck instances?',
  'cms-inventory.clear.description':
    'These are quarantined, or have made no progress for ten minutes. Each is torn down on its host — container, volume, port and webroot — and it cannot be undone. Nothing a customer holds is in this list.',
  'cms-inventory.clear.since': 'since {ago}',
  'cms-inventory.clear.progress': '{done} of {total} torn down…',
  'cms-inventory.clear.keep': 'Keep them',
  'cms-inventory.clear.confirm': 'Clear them',
  'cms-inventory.clear.done_one':
    'Tore down {count} instance. The pool refills to its target on the next sweep.',
  'cms-inventory.clear.done_other':
    'Tore down {count} instances. The pool refills to its target on the next sweep.',
  'cms-inventory.clear.partial': 'Tore down {done} of {total}. {refused}',
  'cms-inventory.review.close': 'Close',
  'cms-inventory.review.title': 'Approve the build of {label}?',
  'cms-inventory.review.description':
    'This approves the whole generation in this pool, not only this instance: it is released to ready now, and every later build of the same generation reaches ready on the machine check alone, without waiting for review.',
  'cms-inventory.review.generation': 'Generation',
  'cms-inventory.review.readBack': 'Read back from this instance',
  'cms-inventory.review.moved':
    'The inventory no longer shows this instance as it is shown here. Close this and open its review again to see what is there now.',
  'cms-inventory.review.unread':
    'This instance could not be read again after the answer. Reload the inventory to see where it stands before approving it again.',
  'cms-inventory.review.notYet': 'Not yet',
  'cms-inventory.review.approving': 'Approving…',
  'cms-inventory.review.confirm': 'Approve this generation',
  'cms-inventory.remove.title': 'Remove {label}?',
  'cms-inventory.remove.description':
    'This tears the site down on {host} — container, volume, port and webroot. It cannot be undone.',
  'cms-inventory.remove.refill':
    'The pool then holds {left} of {target} ready, so the timer’s next run will build a replacement within about {period}.',
  'cms-inventory.remove.keep': 'Keep it',
  'cms-inventory.remove.tearing': 'Tearing down {label} — the row stays in draining until the job finishes.',
  'cms-inventory.remove.confirm': 'Remove and free the disk'
}
