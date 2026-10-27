export class RunawayDetector {
  constructor(options = {}) {
    this.maxIdenticalConsecutive = options.maxIdenticalConsecutive || 30
    this.maxPatternRepetitions = options.maxPatternRepetitions || 6
    this.minPatternLength = options.minPatternLength || 4
    this.maxPatternLength = options.maxPatternLength || 80
    this.history = ''
    this.lastChunk = null
    this.identicalCount = 0
    this.tripped = false
    this.reason = null
  }

  feed(text) {
    if (this.tripped || !text || typeof text !== 'string') return false

    // 1. Check identical consecutive text chunks
    if (this.lastChunk === text) {
      this.identicalCount++
      if (this.identicalCount >= this.maxIdenticalConsecutive) {
        this.tripped = true
        this.reason = `identical_chunk_loop (${this.identicalCount} repetitions of "${text.slice(0, 16)}")`
        return true
      }
    } else {
      this.lastChunk = text
      this.identicalCount = 1
    }

    // 2. Sliding window n-gram repetition detection
    const maxHistLen = this.maxPatternLength * this.maxPatternRepetitions + 128
    this.history += text
    if (this.history.length > maxHistLen * 2) {
      this.history = this.history.slice(-maxHistLen)
    }

    const hLen = this.history.length
    for (let pLen = this.minPatternLength; pLen <= this.maxPatternLength; pLen++) {
      const requiredLen = pLen * this.maxPatternRepetitions
      if (hLen < requiredLen) break

      const pattern = this.history.slice(hLen - pLen)
      let matches = 0
      for (let i = 1; i < this.maxPatternRepetitions; i++) {
        const seg = this.history.slice(hLen - (i + 1) * pLen, hLen - i * pLen)
        if (seg === pattern) {
          matches++
        } else {
          break
        }
      }
      if (matches >= this.maxPatternRepetitions - 1) {
        this.tripped = true
        this.reason = `pattern_repetition_loop (${pLen} chars repeated ${this.maxPatternRepetitions} times: "${pattern.slice(0, 20)}...")`
        return true
      }
    }

    return false
  }

  isTripped() {
    return this.tripped
  }

  getReason() {
    return this.reason
  }
}

/**
 * @param {AsyncIterable<any>} stream
 * @param {Record<string, any>} [options]
 * @returns {AsyncGenerator<any, void, unknown>}
 */
export async function* withRunawayGuard(stream, options = {}) {
  if (options && options.enabled === false) {
    yield* stream
    return
  }

  const detector = new RunawayDetector(options)

  for await (const chunk of stream) {
    if (chunk && chunk.type === 'finish') {
      yield chunk
      continue
    }

    const text = (chunk && typeof chunk === 'object')
      ? (typeof chunk.text === 'string' ? chunk.text : null)
      : null

    if (text && (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta' || !chunk.type)) {
      if (detector.feed(text)) {
        if (options && typeof options === 'object') {
          options.tripped = true
          options.trippedReason = detector.getReason()
          if (typeof options.onRunaway === 'function') {
            options.onRunaway(detector.getReason())
          }
        }
        yield {
          type: 'finish',
          reason: {
            kind: 'stop',
            message: 'runaway_loop_detected',
            detail: detector.getReason(),
          },
        }
        return
      }
    }

    yield chunk
  }
}
