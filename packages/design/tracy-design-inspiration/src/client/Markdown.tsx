/**
 * A small markdown renderer for `DESIGN.md`: headings, paragraphs, lists, tables, bold, code.
 * Checked against the 152 files on 05/09/2026 — they use nothing else that matters — and kept
 * instead of a library because the plugin's bundle is what every lane downloads, and the files it
 * renders are a closed, measured corpus, not the open web.
 */
import type { JSX, ReactNode } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@tracy/ui'

/** Inline: **bold**, `code`. Nothing else. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>)
    else
      out.push(
        <code key={k++} className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {t.slice(1, -1)}
        </code>
      )
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const HEADING_CLASS: Record<number, string> = {
  2: 'mt-8 mb-3 font-semibold text-lg',
  3: 'mt-5 mb-2 font-semibold text-sm',
  4: 'mt-4 mb-1.5 font-semibold text-muted-foreground text-sm'
}

/** Block-level markdown → React. Skips the H1 and the leading blockquote (the header shows them). */
export function Markdown({ md }: { md: string }): JSX.Element {
  const lines = md.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let k = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim() || line.startsWith('# ') || line.startsWith('> ')) {
      i++
      continue
    }
    const h = line.match(/^(#{2,4})\s+(.+)$/)
    if (h) {
      blocks.push(
        <div key={k++} className={HEADING_CLASS[h[1]!.length] ?? HEADING_CLASS[4]}>
          {inline(h[2]!)}
        </div>
      )
      i++
      continue
    }
    if (line.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i]!.startsWith('|')) {
        const cells = lines[i]!.split('|')
          .slice(1, -1)
          .map((c) => c.trim())
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells)
        i++
      }
      const [head, ...body] = rows
      if (head) {
        blocks.push(
          <div key={k++} className="my-3 overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {head.map((c, j) => (
                    <TableHead key={j} className="text-xs uppercase tracking-wide">
                      {inline(c)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {body.map((r, ri) => (
                  <TableRow key={ri}>
                    {r.map((c, j) => (
                      <TableCell key={j} className="text-xs">
                        {inline(c)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      }
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={k++} className="my-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {items.map((t, j) => (
            <li key={j}>{inline(t)}</li>
          ))}
        </ul>
      )
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={k++} className="my-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          {items.map((t, j) => (
            <li key={j}>{inline(t)}</li>
          ))}
        </ol>
      )
      continue
    }
    if (line.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        code.push(lines[i]!)
        i++
      }
      i++
      blocks.push(
        <pre
          key={k++}
          className="my-3 overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs"
        >
          {code.join('\n')}
        </pre>
      )
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,4}\s|\||\s*[-*]\s|\s*\d+\.\s|> |```)/.test(lines[i]!)
    ) {
      para.push(lines[i]!)
      i++
    }
    if (para.length === 0) {
      i++
      continue
    }
    blocks.push(
      <p key={k++} className="my-2 text-sm leading-relaxed">
        {inline(para.join(' '))}
      </p>
    )
  }
  return <>{blocks}</>
}
