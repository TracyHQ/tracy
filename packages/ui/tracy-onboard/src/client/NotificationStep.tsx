/**
 * Step 4 — "Notifications": the mock's `stepNotify`, bound to `app.notifications`. The app reads
 * macOS's permission (`status.permission`, plan contract 7: `allowed` / `denied` / `unknown`; any
 * other value is `unknown`, flow.ts `permissionOf`), and the step follows it:
 *   - denied: an amber card with "Open System Settings"; the sound picker and the test button stay
 *     on the page but disabled, with the reason under them; no status row.
 *   - allowed: the on/off card; after a test, "Test notification sent at …" (sent, not shown: Focus
 *     may still hold it).
 *   - unknown: the on-card says the permission cannot be read; after a test, a reminder to check
 *     Focus and the permission.
 * A system that offers no notifications at all keeps its own line. The turn-finished watcher is not
 * here (`turnFinished` belongs to another plugin).
 */
import type { JSX } from 'react'
import type { NotifyStatus } from './bridge.ts'
import { permissionOf } from './flow.ts'
import { Alert, Bell, Check, External } from './icons.tsx'
import { Bold, type T } from './text.tsx'

/** 'system' (System Default), then macOS's alert sounds in /System/Library/Sounds. Names, not words. */
export const SOUNDS = [
  'system',
  'Basso',
  'Blow',
  'Bottle',
  'Frog',
  'Funk',
  'Glass',
  'Hero',
  'Morse',
  'Ping',
  'Pop',
  'Purr',
  'Sosumi',
  'Submarine',
  'Tink'
] as const

export interface NotificationStepProps {
  readonly t: T
  /** null until the app answered. */
  readonly status: NotifyStatus | null
  /** `status.lastShownAt` as the person's clock shows it. */
  readonly formatTime: (at: number) => string
  readonly onToggle: (on: boolean) => void
  readonly onTest: () => void
  readonly onOpenSettings: () => void
  /** Absent when the app has no sound picker (`notifications.setSound`). */
  readonly onSound?: (name: string) => void
}

export function NotificationStep({
  t,
  status,
  formatTime,
  onToggle,
  onTest,
  onOpenSettings,
  onSound
}: NotificationStepProps): JSX.Element {
  const enabled = status?.enabled ?? true
  const permission = permissionOf(status)
  const blocked = status !== null && permission === 'denied'
  const settingsButton = (primary: boolean) =>
    status?.settingsTarget !== false && (
      <button
        type="button"
        className={`tv-ob-btn ${primary ? 'tv-ob-btn-primary' : 'tv-ob-btn-outline tv-ob-btn-xs'}`}
        data-action="open-settings"
        onClick={onOpenSettings}
      >
        {t('notify.openSystemSettings')} <External />
      </button>
    )
  const state =
    status === null || blocked
      ? null
      : !status.supported
        ? 'unsupported'
        : status.lastShownAt !== null
          ? 'sent'
          : 'not-sent'
  const text =
    state === 'sent'
      ? t('notify.sent', { time: formatTime(status?.lastShownAt as number) }) +
        (permission === 'unknown' ? ` ${t('notify.check')}` : '')
      : state === 'unsupported'
        ? t('notify.unsupported')
        : t('notify.notSent')
  const picker = onSound !== undefined && status !== null
  return (
    <div className="tv-ob-stack" data-step="notifications">
      {status !== null &&
        (blocked ? (
          <div className="tv-ob-enabled-card tv-ob-blocked" data-notify="blocked">
            <span className="tv-ob-enabled-icon tv-ob-warn-icon">
              <Alert />
            </span>
            <div>
              <div className="tv-ob-row-title">{t('notify.blocked')}</div>
              <div className="tv-ob-row-desc">
                <Bold t={t} k="notify.blockedLine" param="switch" value={t('notify.allowSwitch')} />
              </div>
            </div>
            {settingsButton(true)}
          </div>
        ) : (
          <div
            className={`tv-ob-enabled-card${enabled ? ' tv-ob-on' : ''}`}
            data-notify={enabled ? 'on' : 'off'}
          >
            <span className={`tv-ob-enabled-icon${enabled ? '' : ' tv-ob-off'}`}>
              {enabled ? <Check /> : <Bell />}
            </span>
            <div>
              <div className="tv-ob-row-title">{enabled ? t('notify.on') : t('notify.off')}</div>
              <div className="tv-ob-row-desc">
                {!enabled
                  ? t('notify.offLine')
                  : permission === 'unknown'
                    ? t('notify.unknownLine')
                    : t('notify.onLine')}
              </div>
            </div>
          </div>
        ))}
      <div className="tv-ob-row">
        <div>
          <div className="tv-ob-row-title" id="tv-ob-notify-label">
            {t('notify.toggle')}
          </div>
          <div className="tv-ob-row-desc">{t('notify.toggleHint')}</div>
        </div>
        <button
          type="button"
          className="tv-ob-switch"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="tv-ob-notify-label"
          disabled={status === null}
          data-action="notify"
          onClick={() => onToggle(!enabled)}
        />
      </div>
      {state !== null && (
        <div className={`tv-ob-status${state === 'unsupported' ? ' tv-ob-blocked' : ''}`} data-status={state}>
          <span className="tv-ob-status-text">
            <span
              className={`tv-ob-dot${state === 'sent' ? ' tv-ob-ok' : state === 'unsupported' ? ' tv-ob-warn-dot' : ''}`}
            />
            <span>{text}</span>
          </span>
          {settingsButton(false)}
        </div>
      )}
      <section className={blocked ? 'tv-ob-locked' : undefined} aria-disabled={blocked ? true : undefined}>
        {picker && (
          <>
            <div className="tv-ob-section-title" id="tv-ob-sound-label">
              {t('notify.sound')}
            </div>
            <div className="tv-ob-section-line">{t('notify.soundLine')}</div>
          </>
        )}
        <div className="tv-ob-sound-row">
          {picker && (
            <select
              className="tv-ob-select"
              aria-labelledby="tv-ob-sound-label"
              data-action="sound"
              disabled={blocked}
              value={status.sound ?? 'system'}
              onChange={(event) => onSound(event.target.value)}
            >
              {SOUNDS.map((name) => (
                <option key={name} value={name}>
                  {name === 'system' ? t('notify.soundDefault') : name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="tv-ob-btn tv-ob-btn-primary-outline"
            data-action="send-test"
            disabled={status === null || blocked || state === 'unsupported'}
            onClick={onTest}
          >
            <Bell />
            {t('notify.sendTest')}
          </button>
        </div>
      </section>
      {blocked && <div className="tv-ob-locked-why">{t('notify.lockedWhy')}</div>}
    </div>
  )
}
