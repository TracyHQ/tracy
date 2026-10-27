/**
 * WHICH MICROPHONE (council 19/10/2026): the header's Chat/Voice menu lists "System default" and the
 * microphones the browser names (`VoiceMode.tsx` `ModeMenu`), and the one picked is used by dictation
 * and by Voice alike (`voice-capture.ts` `openMicrophone`).
 *
 * - LISTED, NEVER ASKED FOR. A browser names its microphones only once the page may use one; before,
 *   `enumerateDevices()` gives entries with no name (and, in Chrome, no id). Those are left out — the
 *   menu then holds "System default" alone — and the page never asks for the microphone just to fill
 *   a list. The list is read again when devices change (`devicechange`) and after the microphone
 *   opens (names arrive with the permission).
 * - ASKED AS `ideal`, NEVER `exact`. A microphone unplugged since it was picked must not stop the
 *   voice: the browser falls back to its default, and the page says so ({@link fellBack}).
 * - KEPT IN THIS BROWSER ({@link MIC_PICK_KEY}), like the voice Tracy speaks in: a convenience, read and
 *   written in try/catch, so a browser that keeps nothing simply uses the default.
 *
 * Kept free of React and of the browser's globals (handed in), so `test/voice-mic.test.mjs` holds it.
 */

/** Where this browser keeps the microphone picked; '' or absent is the system default. */
export const MIC_PICK_KEY = 'tracy.voice.mic'

/**
 * Chrome's own entries that stand for whatever the system uses now: not a microphone of their own,
 * and the menu's "System default" says the same.
 */
const VIRTUAL_IDS = new Set(['default', 'communications'])

/**
 * @typedef {{ kind?: string, deviceId?: string, label?: string }} DeviceInfo
 * @typedef {{ id: string, label: string }} MicChoice
 */

/**
 * The microphones a person may pick: audio inputs the browser names, each once, in its order.
 * @param {readonly DeviceInfo[] | null | undefined} devices - what `enumerateDevices()` gave
 * @returns {MicChoice[]}
 */
export function micChoices(devices) {
  /** @type {MicChoice[]} */
  const out = []
  const seen = new Set()
  for (const device of devices ?? []) {
    if (device?.kind !== 'audioinput') continue
    const id = typeof device.deviceId === 'string' ? device.deviceId : ''
    const label = typeof device.label === 'string' ? device.label.trim() : ''
    // No name (no permission yet) or no id: nothing a person could recognise or the page could ask for.
    if (id === '' || label === '' || VIRTUAL_IDS.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push({ id, label })
  }
  return out
}

/**
 * The audio the microphone is asked for: one channel, the browser's echo cancelling, noise suppression
 * and gain — and the picked microphone as `ideal`, so a missing one falls back to the default instead
 * of failing.
 * @param {string | null | undefined} deviceId - '' or nothing for the system default
 * @returns {MediaTrackConstraints}
 */
export function audioConstraints(deviceId) {
  return {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {})
  }
}

/**
 * Whether the browser opened another microphone than the one picked (unplugged, or taken away).
 * @param {string | null | undefined} wanted - the id picked, '' for the default
 * @param {string | null | undefined} opened - the opened track's `getSettings().deviceId`
 */
export function fellBack(wanted, opened) {
  if (!wanted) return false
  // A browser that does not say which device it opened: nothing to tell.
  if (!opened) return false
  return opened !== wanted
}

/** @param {{ getItem(key: string): string | null } | null | undefined} storage */
export function readMicPick(storage) {
  try {
    return storage?.getItem(MIC_PICK_KEY) ?? ''
  } catch {
    return ''
  }
}

/** @param {{ setItem(key: string, value: string): void, removeItem(key: string): void } | null | undefined} storage @param {string} id */
export function writeMicPick(storage, id) {
  try {
    if (id === '') storage?.removeItem(MIC_PICK_KEY)
    else storage?.setItem(MIC_PICK_KEY, id)
  } catch {
    // A browser that keeps nothing: the default microphone next time.
  }
}

/**
 * The list and the pick, as one store the menu draws from: read on demand, again on `devicechange`.
 * The pick is the one kept in this browser, even when that microphone is not listed now (unplugged,
 * or names not given yet): asked as `ideal`, it is used again the moment it is back.
 * @param {{
 *   mediaDevices?: { enumerateDevices?(): Promise<DeviceInfo[]>, addEventListener?(type: string, fn: () => void): void, removeEventListener?(type: string, fn: () => void): void } | null,
 *   storage?: any
 * }} deps
 */
export function createMicPicker({ mediaDevices, storage }) {
  /** @type {{ choices: MicChoice[], pick: string }} */
  let state = { choices: [], pick: readMicPick(storage) }
  const listeners = new Set()
  const set = (/** @type {Partial<typeof state>} */ patch) => {
    state = { ...state, ...patch }
    for (const listener of Array.from(listeners)) listener()
  }
  let reading = 0
  const refresh = async () => {
    if (typeof mediaDevices?.enumerateDevices !== 'function') return
    const mine = ++reading
    const devices = await mediaDevices.enumerateDevices().catch(() => null)
    if (mine !== reading || devices === null) return
    const choices = micChoices(devices)
    const same =
      choices.length === state.choices.length &&
      choices.every((c, i) => c.id === state.choices[i]?.id && c.label === state.choices[i]?.label)
    if (!same) set({ choices })
  }
  const onChange = () => void refresh()
  let watching = false
  return {
    getSnapshot: () => state,
    /** @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener)
      if (!watching) {
        watching = true
        mediaDevices?.addEventListener?.('devicechange', onChange)
        void refresh()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && watching) {
          watching = false
          mediaDevices?.removeEventListener?.('devicechange', onChange)
        }
      }
    },
    refresh,
    /** The microphone dictation and Voice open next: '' for the system default. */
    current: () => state.pick,
    /**
     * Pick a microphone ('' for the system default); false when it is the one picked already.
     * @param {string} id
     */
    choose(id) {
      const next = typeof id === 'string' ? id : ''
      if (next === state.pick) return false
      writeMicPick(storage, next)
      set({ pick: next })
      return true
    }
  }
}

/** @typedef {ReturnType<typeof createMicPicker>} MicPicker */

/** This page's `localStorage`, or null where reading it throws (blocked site data, a sandboxed frame). */
export function pageStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
