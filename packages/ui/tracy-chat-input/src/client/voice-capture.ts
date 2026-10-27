/**
 * The microphone, for voice input (`VoiceInput.tsx`): frames of 16 kHz PCM for the voice socket,
 * and how loud each moment is for the bars of the recording row.
 *
 * The audio thread only hands samples over (an AudioWorklet loaded from a Blob: the dsh page has no
 * Content-Security-Policy that would refuse it); the rate conversion and framing are `voice-pcm.mjs`,
 * on the page's thread — a few thousand samples a second.
 *
 * 🔒 THE AudioContext IS MADE BEFORE THE FIRST AWAIT. A browser lets a page start audio only inside
 * the person's press; made after `getUserMedia` resolves, Safari leaves it suspended and the
 * recording row would show bars of nothing. `resume()` is still asked, for a context that starts
 * suspended anyway.
 */
import { audioConstraints, fellBack } from './voice-mic.mjs'
import { downsampler, framer, loudness, toPcm16 } from './voice-pcm.mjs'

export type MicrophoneProblem = 'denied' | 'noMicrophone' | 'unsupported'

/** Why the microphone could not be opened, as the recording row words it (`voice.error.*`). */
export class MicrophoneError extends Error {
  constructor(readonly problem: MicrophoneProblem) {
    super(problem)
  }
}

export interface Microphone {
  /** Hand out the samples still short of a frame, then stop the tracks and close the context. */
  close(): Promise<void>
  /**
   * The microphone picked (`voice-mic.mjs`) was not there and the browser opened its default instead:
   * the page says so (council 19/10/2026).
   */
  fellBack: boolean
}

/** Posts each input block to the page; outputs nothing (its silent output keeps it pulled). */
const TAP = `class TracyVoiceTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length) this.port.postMessage(channel.slice(0))
    return true
  }
}
registerProcessor('tracy-voice-tap', TracyVoiceTap)`

function problemOf(error: unknown): MicrophoneProblem {
  const name = (error as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError')
    return 'noMicrophone'
  return 'unsupported'
}

/**
 * Open the microphone. Call it inside the person's press.
 * @param onFrame - each 100 ms frame of 16 kHz PCM, and a last shorter one on close.
 * @param onLevel - how loud the latest block was, 0…1.
 * @param onLost - the microphone went away while recording (unplugged, taken by the system).
 * @param options.deviceId - the microphone picked in the Chat/Voice menu, '' for the system default;
 *   asked as `ideal`, so one unplugged since falls back to the default (`fellBack`).
 */
export async function openMicrophone(
  onFrame: (frame: ArrayBuffer) => void,
  onLevel: (level: number) => void,
  onLost: () => void,
  { deviceId = '' }: { deviceId?: string } = {}
): Promise<Microphone> {
  const Context = globalThis.AudioContext
  if (!navigator.mediaDevices?.getUserMedia || !Context || typeof AudioWorkletNode === 'undefined')
    throw new MicrophoneError('unsupported')
  const context = new Context()
  let stream: MediaStream | null = null
  let moduleUrl: string | null = null
  const release = async () => {
    stream?.getTracks().forEach((track) => track.stop())
    if (moduleUrl) URL.revokeObjectURL(moduleUrl)
    await context.close().catch(() => {})
  }
  try {
    void context.resume().catch(() => {})
    stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) })
    moduleUrl = URL.createObjectURL(new Blob([TAP], { type: 'application/javascript' }))
    await context.audioWorklet.addModule(moduleUrl)
  } catch (error) {
    await release()
    throw new MicrophoneError(problemOf(error))
  }
  const source = context.createMediaStreamSource(stream)
  const tap = new AudioWorkletNode(context, 'tracy-voice-tap', { numberOfInputs: 1, numberOfOutputs: 1 })
  const down = downsampler(context.sampleRate)
  const frames = framer(onFrame)
  tap.port.onmessage = (event: MessageEvent<Float32Array>) => {
    onLevel(loudness(event.data))
    frames.push(toPcm16(down(event.data)))
  }
  source.connect(tap)
  tap.connect(context.destination)
  const track = stream.getAudioTracks()[0]
  track?.addEventListener('ended', onLost)
  return {
    fellBack: fellBack(deviceId, track?.getSettings?.().deviceId),
    async close() {
      track?.removeEventListener('ended', onLost)
      tap.port.onmessage = null
      frames.flush()
      source.disconnect()
      tap.disconnect()
      await release()
    }
  }
}
