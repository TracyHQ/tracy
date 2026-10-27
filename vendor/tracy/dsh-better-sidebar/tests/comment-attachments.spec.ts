/**
 * The pure half of a comment box's files (comment-attachments.ts): what a box takes, what it refuses
 * and why, the caps it says, and a file chip's type badge (Akemi 01/10, edit-mode review "attachments").
 */
import { afterEach, describe, expect, it } from 'vitest'
import { ATTACHMENT_MAX_BYTES, addToDraft, boxLimits, fileBadge, formatBytes, formatLimit, notSentLine } from '../src/client/comment-attachments.ts'
import { localeDicts } from '../src/client/chunks/locale.tsx'
import { attachLocale, attachLocaleDicts } from '../src/client/locales.ts'

const file = (name: string, size: number, type = 'image/png'): File => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('a box\'s draft of files', () => {
  it('takes what fits; names every file it refused, with the cap it went over', () => {
    const step = addToDraft([], [file('a.png', 10), file('big.zip', 30_000_000, 'application/zip'), file('b.png', 10), file('c.png', 10)], { maxBytes: 20_000_000, maxFiles: 2 })
    expect(step.draft.map(d => (d.kind === 'file' ? d.file.name : ''))).toEqual(['a.png', 'b.png'])
    expect(step.refusedFiles.map(f => [f.name, f.code, f.limit, f.type])).toEqual([
      ['big.zip', 'too-large', 20_000_000, 'application/zip'],
      ['c.png', 'too-many', 2, 'image/png'],
    ])
    // The sentence keeps its old rule: the file cap, once hit, is what it says.
    expect(step.refused).toEqual({ code: 'too-many', limit: 2 })
    expect(new Set(step.refusedFiles.map(f => f.key)).size).toBe(2)
  })

  it('past the file cap, every later file is refused as one too many, whatever its size', () => {
    const step = addToDraft([], [file('a.png', 10), file('b.png', 10), file('huge.mov', 99_000_000)], { maxBytes: 20_000_000, maxFiles: 1 })
    expect(step.refusedFiles.map(f => [f.name, f.code])).toEqual([['b.png', 'too-many'], ['huge.mov', 'too-many']])
  })

  it('nothing refused: no chips, no sentence', () => {
    const step = addToDraft([], [file('a.png', 10)], { maxBytes: 20, maxFiles: 2 })
    expect([step.refused, step.refusedFiles]).toEqual([null, []])
  })
})

describe('the caps a box applies and says', () => {
  it('the smaller of the server\'s and the chat\'s (20 MiB, 20 files)', () => {
    expect(boxLimits({ maxBytes: 50_000_000, maxFiles: 50 })).toEqual({ maxBytes: ATTACHMENT_MAX_BYTES, maxFiles: 20 })
    expect(boxLimits({ maxBytes: 10_000_000, maxFiles: 5 })).toEqual({ maxBytes: 10_000_000, maxFiles: 5 })
  })

  it('a limit reads as its round number: 20 MiB is "20 MB" (Akemi 01/10: it read "21 MB"); a file\'s own size stays 1000-based', () => {
    expect(formatLimit(ATTACHMENT_MAX_BYTES)).toBe('20 MB')
    expect([formatLimit(512 * 1024), formatLimit(2 * 1024 ** 3), formatLimit(10_000_000), formatLimit(1_500_000)]).toEqual(['512 KB', '2 GB', '10 MB', '1.5 MB'])
    expect(formatBytes(ATTACHMENT_MAX_BYTES)).toBe('21 MB')
  })
})

describe('a file chip\'s type badge (the chat composer\'s)', () => {
  it('the extension, at most four letters, upper case; FILE without one', () => {
    expect(['brief.pdf', 'site-backup.zip', 'notes.markdown', 'README', '.env', 'odd.', 'x.t-x-t'].map(fileBadge)).toEqual(['PDF', 'ZIP', 'MARK', 'FILE', 'FILE', 'FILE', 'TXT'])
  })
})

describe('the line a send adds for a file that could not go (TCH #765)', () => {
  const localeOn = (active: string) => ({ getSnapshot: () => ({ active }) })
  afterEach(() => {
    attachLocale(undefined)
    attachLocaleDicts(undefined)
  })

  it('says each reason in English by default, with the file name', () => {
    expect(notSentLine('plan.pdf', 'too-large')).toBe('(plan.pdf not sent: too large)')
    expect(notSentLine('plan.pdf', 'too-many')).toBe('(plan.pdf not sent: too many files)')
    expect(notSentLine('plan.pdf', 'unreadable')).toBe('(plan.pdf not sent: could not be read)')
  })

  it('follows the interface language instead of staying English', () => {
    attachLocale(localeOn('zh'))
    expect(notSentLine('plan.pdf', 'too-large')).toBe('（plan.pdf 未发送：文件过大）')
    attachLocaleDicts(localeDicts)
    attachLocale(localeOn('es'))
    expect(notSentLine('plan.pdf', 'too-many')).toBe('(plan.pdf no enviado: demasiados archivos)')
    attachLocale(localeOn('vi'))
    expect(notSentLine('plan.pdf', 'unreadable')).toBe('(plan.pdf chưa được gửi: không đọc được tệp)')
  })

  it('keeps the {name} hole in every language the side card ships', () => {
    for (const [lang, dict] of Object.entries(localeDicts)) {
      for (const key of ['commentNotSentTooLarge', 'commentNotSentTooMany', 'commentNotSentUnreadable']) {
        expect(dict[key], `${lang} ${key}`).toContain('{name}')
      }
    }
  })
})
