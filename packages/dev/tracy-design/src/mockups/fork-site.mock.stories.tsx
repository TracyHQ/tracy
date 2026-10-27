/**
 * THROWAWAY MOCK — the Fork branch of Add site, and the Fork tab on the new lane. Not shipped code.
 *
 * THE QUESTION IT EXISTS TO ANSWER: round 2 makes the fork a deterministic pipeline (06/09)
 * and adds the input the customer never had — their own words. What does the card's form ask for,
 * in what order, without an address field (skip the .tracy.ai chooser here), and what does the
 * customer watch on the new lane while the six stages run, then what are the ONLY two buttons at
 * the end? Four states on one page: the form, running, done, and "nothing to write from".
 *
 * WHAT DECIDES IT: the reference site gives look and outline only; the words must come from the
 * customer — their current site if they have one, else a name and one line. Both are asked on the
 * same card, the address is derived from the name and shown as a sentence, not a field. The
 * progress is one list of six lines in the customer's words (no stage names), and the end offers
 * Open site and Undo — nothing else, because everything else is the agent's job from here.
 *
 * WHAT IS NOT BEING ASKED HERE: the words of the six stages beyond a first draft; platform pills
 * for Joomla and EmDash (round 3 — shown disabled so the shape does not change later).
 *
 * ⚠ THIS IS MODE A — Tailwind, Tracy owns `<html>`. The real screens are `dsh-add-site` (wizard)
 * and the new `dsh-fork` tab, MODE B, plain CSS. Whatever wins here is REWRITTEN there, not
 * copied. `DESIGN.md` §0.
 */
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  Input,
  Label,
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  Separator,
  Textarea
} from '@tracy/ui'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  RotateCcw,
  X,
  XCircle
} from 'lucide-react'
import { useState } from 'react'

import sample from '../fixtures/fork-brief.json'

import { LanguageBox } from './language-box'

const meta: Meta = {
  title: 'Mockups/Fork a site',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

function Frame({ note, children, wide }: { note: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="h-full overflow-auto bg-background">
      <div className={cn('mx-auto w-full px-6 py-10', wide ? 'max-w-3xl' : 'max-w-2xl')}>
        <p className="mb-6 text-muted-foreground text-sm">{note}</p>
        <Card>
          <CardContent className="flex flex-col gap-6 py-6">{children}</CardContent>
        </Card>
      </div>
    </div>
  )
}

/** The three origin cards, as the wizard draws them; the third is selected here. */
function OriginCards({ selected = 2 }: { selected?: 0 | 1 | 2 }) {
  const rows: [string, string][] = [
    ['Create a new site', 'Tracy builds it on its own servers, ready in a few minutes.'],
    ['Import existing site', 'Bring a site that already runs on the open web.'],
    [
      'Fork a site from any URL, on a CMS you love',
      'Its look, your words and pictures, rebuilt on Joomla, WordPress or EmDash.'
    ]
  ]
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([title, sub], i) => {
        const on = i === selected
        return (
          <div
            key={title}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-4 py-3',
              on ? 'border-primary bg-primary/5' : 'border-border'
            )}
          >
            <span
              className={cn(
                'mt-0.5 size-4 rounded-full border',
                on ? 'border-primary bg-primary shadow-[inset_0_0_0_3px_white]' : 'border-border'
              )}
            />
            <div>
              <div className="font-medium text-sm">{title}</div>
              <div className="text-muted-foreground text-sm">{sub}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  )
}

function Pills({ items, on, soon }: { items: string[]; on: string; soon?: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((p) => {
        const disabled = soon?.includes(p)
        return (
          <span
            key={p}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm',
              p === on ? 'border-primary bg-primary/10 font-medium' : 'border-border',
              disabled && 'opacity-50'
            )}
          >
            {p}
            {disabled ? (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                soon
              </Badge>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}

/** The address label from a name: diacritics folded, DNS-safe, and never shorter than eight characters. */
function labelFrom(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug === '') return ''
  // 06/09: eight to twenty-four characters — a short name gets a word, then digits; a long one
  // is cut at a hyphen when there is one near the end, never mid-word if it can be helped.
  let out = slug.length < 8 ? `${slug}-site` : slug
  while (out.length < 8) out += '0'
  if (out.length > 24) {
    const cut = out.slice(0, 24)
    const dash = cut.lastIndexOf('-')
    out = dash >= 8 ? cut.slice(0, dash) : cut
  }
  return out.replace(/-+$/, '')
}

/**
 * The business name is not asked (06/09): it is found in what the customer wrote or
 * attached — one short model call at the pipeline's first step — and the address follows that name.
 * The mock guesses a name from the first two capitalised words so the form shows the same shape.
 */
function guessName(about: string): string {
  const m = about.match(/([A-ZÀ-Ỹ][\wÀ-ỹ'’]+(?:\s+[A-ZÀ-Ỹ][\wÀ-ỹ'’]+)+)/)
  if (m) return m[1]
  return about.split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
}

type Attached = { name: string; size: string }

/** What the form accepts, and how much: business info, not media libraries. */
const ATTACH_RULE = 'PDF, Word, text, Markdown or images · up to 5 files · 10 MB each'

function ForkForm({ about }: { about: string }) {
  const [likeUrl, setLikeUrl] = useState('https://www.joomlart.com')
  const [currentSite, setCurrentSite] = useState('')
  const [typedAbout, setTypedAbout] = useState(about)
  const [files, setFiles] = useState<Attached[]>([])
  const [dragging, setDragging] = useState(false)
  const [cms, setCms] = useState<'wordpress' | null>('wordpress')
  const [languages, setLanguages] = useState<string[]>(['en'])
  // The address appears only after the customer leaves the description: Tracy reads a name out of it
  // (a short model call in the real thing), then derives the label — nothing jumps while typing.
  const [finding, setFinding] = useState(false)
  const [label, setLabel] = useState(about ? labelFrom(guessName(about)) : '')
  const [labelTouched, setLabelTouched] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const settle = () => {
    if (labelTouched || typedAbout.trim() === '') return
    setFinding(true)
    window.setTimeout(() => {
      setLabel(labelFrom(guessName(typedAbout)))
      setFinding(false)
    }, 900)
  }
  const attach = (names: string[]) =>
    setFiles((f) =>
      [...f, ...names.map((name) => ({ name, size: `${(Math.random() * 3 + 0.2).toFixed(1)} MB` }))].slice(
        0,
        5
      )
    )
  const complete =
    likeUrl.trim() !== '' &&
    (typedAbout.trim() !== '' || files.length > 0) &&
    cms !== null &&
    languages.length > 0 &&
    label !== ''
  return (
    <>
      <OriginCards />
      <Separator className="h-px w-full" />
      <Field
        label="A site you like"
        hint="Paste the address of a public site whose look you want to start from."
      >
        <Input value={likeUrl} onChange={(e) => setLikeUrl(e.target.value)} spellCheck={false} />
      </Field>
      <Field label="Your current site (optional)">
        <Input
          value={currentSite}
          onChange={(e) => setCurrentSite(e.target.value)}
          placeholder="https://"
          spellCheck={false}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <Label>
          One line about your business or{' '}
          <button
            type="button"
            className="text-primary underline underline-offset-4"
            onClick={() => attach(['company-profile.pdf'])}
          >
            attach
          </button>{' '}
          any business info
        </Label>
        <div
          className={cn('relative rounded-md', dragging && 'ring-2 ring-primary')}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            attach(Array.from(e.dataTransfer.files).map((f) => f.name))
          }}
        >
          <Textarea
            rows={3}
            value={typedAbout}
            onChange={(e) => setTypedAbout(e.target.value)}
            onBlur={settle}
            placeholder="What you do and for whom — or drop a brochure, a profile, a price list here."
            className="pr-10"
          />
          <button
            type="button"
            aria-label="Attach a file"
            className="absolute right-2 bottom-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => attach(['services-2026.docx'])}
          >
            <Paperclip className="size-4" />
          </button>
        </div>
        {files.length > 0 ? (
          <AttachmentGroup>
            {files.map((f) => (
              <Attachment key={f.name} size="sm">
                <AttachmentMedia variant="icon">
                  <FileText />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{f.name}</AttachmentTitle>
                  <AttachmentDescription>{f.size}</AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((x) => x.filter((y) => y !== f))}
                  >
                    <X />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}
          </AttachmentGroup>
        ) : null}
        <span className="text-muted-foreground text-xs">{ATTACH_RULE}</span>
      </div>
      <Field label="CMS you love?">
        <div className="flex flex-wrap items-center gap-2">
          <Pills
            items={['WordPress', 'Joomla', 'EmDash']}
            on={cms === 'wordpress' ? 'WordPress' : ''}
            soon={['Joomla', 'EmDash']}
          />
          <span className="text-muted-foreground text-sm">Or</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setCms('wordpress')}>
            Pick it up for me
          </Button>
        </div>
      </Field>
      <LanguageBox typed={typedAbout} picked={languages} setPicked={setLanguages} />
      {editingLabel ? (
        <div className="flex flex-col gap-2">
          <div className="flex">
            <Input
              value={draftLabel}
              onChange={(e) =>
                setDraftLabel(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, '')
                    .slice(0, 24)
                )
              }
              className="rounded-r-none"
              autoFocus
            />
            <span className="inline-flex items-center rounded-r-md border border-l-0 border-border bg-muted px-3 text-muted-foreground text-sm">
              .tracy.ai
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={draftLabel.length < 8}
              onClick={() => {
                setLabel(draftLabel)
                setLabelTouched(true)
                setEditingLabel(false)
              }}
            >
              Use this address
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditingLabel(false)}>
              Cancel
            </Button>
            <span className="text-muted-foreground text-xs">8 to 24 characters · {draftLabel.length}/24</span>
          </div>
        </div>
      ) : finding ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" /> Reading a name out of what you wrote…
        </p>
      ) : label ? (
        <p className="text-sm">
          <span className="font-medium">{label}.tracy.ai</span>
          <span className="text-green-700 dark:text-green-400"> is available.</span>
          <Button
            type="button"
            variant="link"
            className="h-auto px-1.5 py-0 text-sm"
            onClick={() => {
              setDraftLabel(label)
              setEditingLabel(true)
            }}
          >
            Change
          </Button>
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          Your address appears here once Tracy has read about your business.
        </p>
      )}
      <Button type="button" className="w-full" disabled={!complete}>
        Fork site
      </Button>
      {!complete ? (
        <p className="-mt-3 text-muted-foreground text-xs">
          Every field is needed before Tracy can start; only your current site is optional.
        </p>
      ) : null}
    </>
  )
}

/** State 1 — the form. Look from one URL; words from the customer; CMS picked or left to Tracy; address derived. */
export const Form: Story = {
  render: () => (
    <Frame note="State 1 — the Fork branch of Add site (edits 06/09). There is no name field: Tracy reads the name out of the description or the attached files (one short model call) and the address follows it once you leave the box; attach by the link, the paperclip, or by dropping files: the picker opens and, if your text is not English, suggests the language it detects first. Interactive.">
      <ForkForm about="Claude Studio is a small web design studio building fast Joomla and WordPress sites for local businesses. We take a brief on Monday and ship on Friday." />
    </Frame>
  )
}

/** State 1b — the same form with a Vietnamese brief: More suggests Vietnamese first. */
export const FormVietnamese: Story = {
  render: () => (
    <Frame note="State 1b — the same form, brief typed in Vietnamese. Click into the language box: the detected language is offered first, typing searches, every chip can be removed.">
      <ForkForm about={sample.vi} />
    </Frame>
  )
}

type Mark = { label: string; detail?: string; state: 'done' | 'active' | 'failed' | 'pending' }

const STAGES = (upTo: number, failAt?: number): Mark[] =>
  [
    { label: 'Reading the look of joomlart.com', detail: '20 pages · 20 colours · Inter' },
    { label: 'Collecting your words', detail: 'from what you wrote' },
    { label: 'Writing your pages', detail: 'Home · About · Services · Contact' },
    { label: 'Building the theme', detail: 'tracy-joomlart' },
    { label: 'Putting the pages on your site' },
    { label: 'Switching the site to the new look' }
  ].map((m, i) => ({
    ...m,
    state: failAt === i ? 'failed' : i < upTo ? 'done' : i === upTo ? 'active' : 'pending'
  }))

function Console({ marks }: { marks: Mark[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {marks.map((m) => (
        <div key={m.label} className="flex items-center gap-2.5 text-sm">
          {m.state === 'done' ? (
            <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
          ) : m.state === 'active' ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : m.state === 'failed' ? (
            <XCircle className="size-4 text-destructive" />
          ) : (
            <Circle className="size-4 text-muted-foreground/40" />
          )}
          <span className={cn(m.state === 'pending' && 'text-muted-foreground')}>{m.label}</span>
          {m.detail && m.state === 'done' ? (
            <span className="text-muted-foreground text-xs">· {m.detail}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="font-semibold text-base tracking-tight">{title}</h1>
      <p className="mt-1 text-muted-foreground text-sm">{sub}</p>
    </div>
  )
}

/** State 2 — the Fork tab on the new lane while the pipeline runs. One list, six lines, no stage names. */
export const Running: Story = {
  render: () => (
    <Frame note="State 2 — the Fork tab opens by itself on the new lane (the wizard's Open workspace link carries the brief). Six lines in the customer's words; a done line keeps a short fact. About two minutes end to end.">
      <Heading
        title="Forking joomlart.com for Claude Studio"
        sub="Its look, your words. Tracy is building the site now — no need to do anything."
      />
      <Console marks={STAGES(2)} />
      <p className="text-muted-foreground text-sm">
        Writing four pages takes about a minute. You can close this tab; it picks up where it was.
      </p>
    </Frame>
  )
}

/** State 3 — done. Two buttons only; what was done is said in one paragraph, undo is one press. */
export const Done: Story = {
  render: () => (
    <Frame note="State 3 — done. Open site is the only primary; Undo returns the previous theme and removes the four pages (one apply_id). Everything after this is the agent's job in the chat.">
      <Heading
        title="claude-studio.tracy.ai is ready"
        sub="Built in the look of joomlart.com with your words."
      />
      <Console marks={STAGES(6)} />
      <p className="text-sm">
        Tracy installed the theme <span className="font-medium">tracy-joomlart</span> and wrote four pages —{' '}
        <span className="font-medium">Home, About, Services, Contact</span>. The logo is your name set in the
        site's display face until you upload one. Ask the agent in the chat to change anything.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="gap-1.5">
          Open site
          <ExternalLink className="size-3.5" />
        </Button>
        <Button type="button" variant="outline" className="gap-1.5">
          <RotateCcw className="size-3.5" />
          Undo
        </Button>
      </div>
    </Frame>
  )
}

/** State 4 — nothing to write from. The look is kept; the words are the customer's to add. */
export const NoWords: Story = {
  render: () => (
    <Frame note="State 4 — the reference was read but there is nothing to write from (the current site could not be fetched and the brief is empty). Tracy does not invent a business: the look stays ready, the customer supplies the words.">
      <Heading
        title="Forking joomlart.com"
        sub="Its look is ready. Tracy needs your words before it can write the pages."
      />
      <Console marks={STAGES(1, 1)} />
      <Alert variant="destructive">
        <AlertDescription>
          Your current site could not be read, and there is no description to write from. Add one line about
          your business, or a site Tracy can reach, and try again.
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <Field label="Business name">
          <Input placeholder="Your name as it should appear on the site" />
        </Field>
        <Field label="One line about it">
          <Input placeholder="What you do and for whom" />
        </Field>
        <Button type="button" className="self-start">
          Write the pages
        </Button>
      </div>
    </Frame>
  )
}

// ---- The two branches that already ship, drawn as they are today (so all three can be revised on one page) ----

/** Create, as `wizard.tsx` draws it now: platform pills (Joomla default), the .tracy.ai address, one button. */
export const CreateToday: Story = {
  render: () => (
    <Frame note="Create a new site — AS SHIPPED today (dsh-add-site 0.6.28), for comparison. Platform pills with Joomla selected by default, the address field with the fixed .tracy.ai suffix, one button.">
      <OriginCards selected={0} />
      <Separator className="h-px w-full" />
      <Field label="What it runs on">
        <Pills items={['Joomla', 'WordPress', 'EmDash']} on="Joomla" />
      </Field>
      <Field label="Address" hint="Your site will answer at my-site.tracy.ai">
        <div className="flex">
          <Input placeholder="my-site" className="rounded-r-none" />
          <span className="inline-flex items-center rounded-r-md border border-l-0 border-border bg-muted px-3 text-muted-foreground text-sm">
            .tracy.ai
          </span>
        </div>
      </Field>
      <Button type="button" className="w-full">
        Create site
      </Button>
    </Frame>
  )
}

/** Import, step 1 as shipped: which site, on what. */
export const ImportTodayStep1: Story = {
  render: () => (
    <Frame note="Import existing site — step 1 AS SHIPPED. Two platforms (Joomla, WordPress), the site's address; on blur Tracy detects the platform and only advises on a mismatch. Continue goes to step 2.">
      <OriginCards selected={1} />
      <Separator className="h-px w-full" />
      <Heading title="Which site are you bringing over?" sub="" />
      <Field label="What it runs on">
        <Pills items={['Joomla', 'WordPress']} on="Joomla" />
      </Field>
      <Field label="Site address">
        <Input defaultValue="https://www.joomlart.com" spellCheck={false} />
      </Field>
      <Button type="button" className="w-full">
        Continue
      </Button>
    </Frame>
  )
}

/** Import, step 2 as shipped: two ways to let Tracy read the site; the admin way is open here. */
export const ImportTodayConnect: Story = {
  render: () => (
    <Frame note="Import existing site — step 2 AS SHIPPED. Two ways as a second radio pair: give admin access (Tracy installs Claude Cowork itself) or install it yourself and paste the code. The admin way is selected; the optional second-password block is collapsed under a checkbox.">
      <Heading title="Tracy needs to read this site" sub="" />
      <div className="flex flex-col gap-2">
        {[
          [
            'Give Tracy admin access',
            'Tracy signs in once, installs Claude Cowork, and never keeps your password.',
            true
          ],
          [
            'I will install it myself',
            'Install Claude Cowork on your site, then paste the code it shows you.',
            false
          ]
        ].map(([title, sub, on]) => (
          <div
            key={String(title)}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-4 py-3',
              on ? 'border-primary bg-primary/5' : 'border-border'
            )}
          >
            <span
              className={cn(
                'mt-0.5 size-4 rounded-full border',
                on ? 'border-primary bg-primary shadow-[inset_0_0_0_3px_white]' : 'border-border'
              )}
            />
            <div>
              <div className="font-medium text-sm">{title}</div>
              <div className="text-muted-foreground text-sm">{sub}</div>
            </div>
          </div>
        ))}
      </div>
      <Field label="Admin address">
        <Input defaultValue="https://www.joomlart.com/administrator" spellCheck={false} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Username">
          <Input placeholder="admin" />
        </Field>
        <Field label="Password">
          <Input type="password" placeholder="••••••••" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" />
        This admin page asks for a second password first
      </label>
      <Button type="button" className="w-full">
        Start import
      </Button>
    </Frame>
  )
}
