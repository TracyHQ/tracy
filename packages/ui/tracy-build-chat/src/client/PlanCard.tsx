/**
 * The plan card (TracyHQ/tracy#606, #607, #575): the Contract B plan as labelled values, read before approval. What
 * the owner gets, what the site says first, the business facts with their source, the look with the logo on a light
 * and a dark ground, the services, how customers reach the business, the pages (what every page shares said once,
 * then each page's sections with what they hold and carry), the pictures, the assumptions, what is not on the site in
 * groups by why, what came from each source, each page's search intent and what the owner can send later. It shows
 * no written copy: copy is written after approval.
 *
 * A part the kit lets the owner take off (a page, a section, a service or photo in a section, a key message, a way
 * to contact the business in the footers, a later entry) has a trash button: it sends one plan operation through the
 * same plan edit door (`planOperationOf`), and what was taken off is listed with Bring back. The edits bar counts the
 * changes of this review and goes back to the original plan after a confirm inside the card.
 *
 * A value a Contract B plan edit can change (a fact, a service name, the accent colour)
 * is a button: pressed, it turns into an editor; Enter or Save sends one structured plan edit (`onEdit`), Escape or
 * Cancel puts the value back, and focus returns to the value either way. Values a plan edit cannot set as text (the
 * language, the template, the logo, what a block holds, your photos) are shown, not offered. A fact the sources
 * disagree on offers its values as a radio group instead. Every change goes through `send(changes)`, and the card
 * follows the draft it gets back: its plan, its last edit and whether one undo is still offered (`onUndo`).
 *
 * The value just changed is highlighted from the draft (`changedFieldsOf`), not from what this card remembers, so a
 * card drawn again from the draft shows the same highlight. A larger change asked for in the chat arrives as a newer
 * plan in `plan`: the card draws it in place; there is one living plan and no list of versions. A renamed service is
 * one change to its item: every block that shows the services reads the item, so the Services page and the Services
 * block on Home follow without the card touching them. Approve and Change the plan are dsh's plan review bar, fed by
 * `planReviewRequestOf`; this card writes nothing else.
 */
import { IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  type PlanCard as Card,
  changedFieldsOf,
  type PlanDraft,
  type PlanEdit,
  type PlanFact,
  type PlanOperation,
  type PlanReview,
  plainTextOf,
  planCardOf,
  planChangeOf,
  planEditOf,
  planOperationOf,
  type RevisionNote
} from '@tracy/core/build-chat'
import { useEffect, useId, useRef, useState } from 'react'
import { type EditContext, EditableValue, UndoIcon } from './EditableValue'
import { Conflict, languageName, listOf, plural, Row, Section, Value } from './plan-card-parts'
import { assumptionOf, factShownOf, logoSourceOf, picturesEstimateOf } from './plan-codes'
import { Later, NotOnSite, Sources } from './plan-review-bottom'
import { PagesView, SearchView } from './plan-review-pages'
import { EditsBar, KeyMessages, Reach, type ReviewContext, YouGet } from './plan-review-top'
import { factLabelOf, sentenceOf, sourceNameOf } from './plan-words'
import { changedLineOf, type LineContext, notDoneLineOf } from './revision-lines'
import { refusalOf } from './save-plan-edit'
import type { StringKey, Translate } from './strings'

export interface PlanCardProps {
  /** The Contract B plan as the draft holds it now. */
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B plan, checked by the contract
  plan: any
  /** The draft's last plan edit (`lastEdit`), for the changed value highlight. */
  lastEdit?: PlanDraft['lastEdit']
  /** Whether the draft offers one undo (`canUndo`). */
  canUndo?: boolean
  /** Where the plan's accent and logo came from (`lookSources` of the draft): a drawn logo is said as drawn. */
  lookSources?: PlanDraft['lookSources']
  t: Translate
  /** The draft's plan review (#575): changes counted, what can come back, the kit's locks. */
  review?: PlanReview | null
  /** Sends a structured plan edit or plan operation and resolves to the draft tracy-web answered with. */
  onEdit: (edit: PlanEdit) => Promise<PlanDraft>
  /** Takes the last plan edit back and resolves to the draft tracy-web answered with. */
  onUndo: () => Promise<PlanDraft>
  /** The interface language, for the site language's name. */
  locale?: string
  /** A fresh plan edit id; a test passes a fixed one. */
  newEditId?: () => string
  /** What the last change request did (#609): drawn as a note at the top until it is dismissed. */
  revised?: RevisionNote | null
  /** The owner hides the note. */
  onDismissRevised?: () => void
  /** A change was refused because the plan moved meanwhile: read the draft again. */
  onStale?: () => void
}

/** The same line said again and again becomes one line with a count, in the order it first came. */
function grouped<T>(items: T[], keyOf: (item: T) => string): { item: T; count: number }[] {
  const lines = new Map<string, { item: T; count: number }>()
  for (const item of items) {
    const seen = lines.get(keyOf(item))
    if (seen) seen.count += 1
    else lines.set(keyOf(item), { item, count: 1 })
  }
  return [...lines.values()]
}
const counted = (text: string, count: number) => (count === 1 ? text : `${text} (${count})`)

/**
 * The lines of an edit the agent made, in the card's words: "Main colour is now #0B1F3A.". A field the card does not
 * show by that name has no line.
 */
function editLinesOf(t: Translate, card: Card, edits: RevisionNote['edits']): string[] {
  const lines: string[] = []
  for (const { field, value } of edits ?? []) {
    const fact = card.facts.find((f) => f.field === field)
    const service = card.services.findIndex((s) => s.field === field)
    const label = fact
      ? factLabelOf(t, fact.kind, fact.label)
      : field === 'look.accent'
        ? t(card.look.accentDark === null ? 'plan.look.accent' : 'plan.look.accentLight')
        : service >= 0
          ? t('plan.service', { n: service + 1 })
          : field === 'pictures.generated.frames'
            ? t('plan.pictures.drawn')
            : null
    if (label !== null) lines.push(t('plan.revised.edited', { label, value: plainTextOf(String(value)) }))
  }
  return lines
}

/** What the last change request did: what changed, and what was not done with its reason. */
function RevisionNoteView({
  note,
  edited,
  t,
  undoHintId,
  onDismiss,
  lineContext
}: {
  note: RevisionNote
  /** The lines of an edit the agent made (`editLinesOf`), shown with what changed. */
  edited: string[]
  t: Translate
  /** The interface language and the plan's facts, for a line said from its params (opening hours). */
  lineContext: LineContext
  /** Set while Undo cannot take this change back: the note says why, and Undo points at it. */
  undoHintId?: string
  onDismiss: () => void
}) {
  // A line with a stable code is said in the card's words (`revision-lines.ts`); any other keeps the server's text.
  // Codes that do not run one to one beside their lines are not read at all: never a shifted translation.
  const beside = <T,>(codes: T[] | undefined, lines: unknown[]): T[] | null =>
    Array.isArray(codes) && codes.length === lines.length ? codes : null
  const changedCodes = beside(note.codes?.changed, note.changed)
  const notDoneCodes = beside(note.codes?.notDone, note.notDone)
  // The params and refusal kinds of each line (#609): read only beside a code list that runs one to one too.
  const changedParams = changedCodes ? beside(note.codes?.changedParams, note.changed) : null
  const notDoneParams = notDoneCodes ? beside(note.codes?.notDoneParams, note.notDone) : null
  const notDoneReasons = notDoneCodes ? beside(note.codes?.notDoneReasons, note.notDone) : null
  const changed = grouped(
    [
      ...note.changed.map((line, i) =>
        changedLineOf(t, changedCodes?.[i], plainTextOf(line), changedParams?.[i], lineContext)
      ),
      ...edited
    ],
    (line) => line
  )
  const notDone = grouped(
    note.notDone.map((e, i) =>
      notDoneLineOf(
        t,
        notDoneCodes?.[i],
        { what: plainTextOf(e.what), why: plainTextOf(e.why) },
        notDoneParams?.[i],
        notDoneReasons?.[i]
      )
    ),
    (e) => `${e.what}\n${e.why}`
  )
  return (
    <section className="tv-bc-plan-sec tv-bc-plan-rev" aria-label={t('plan.revised.changed')}>
      <div className="tv-bc-plan-rev-h">
        <h4>{t(changed.length > 0 ? 'plan.revised.changed' : 'plan.revised.notDone')}</h4>
        <button
          type="button"
          className="tv-bc-btn"
          data-ghost=""
          aria-label={t('plan.revised.dismiss')}
          onClick={onDismiss}
        >
          <IconCloseOutlineRegular aria-hidden />
        </button>
      </div>
      {changed.length > 0 && (
        <ul className="tv-bc-plain">
          {changed.map(({ item, count }) => (
            <li key={item}>{counted(item, count)}</li>
          ))}
        </ul>
      )}
      {changed.length > 0 && notDone.length > 0 && (
        <h4 className="tv-bc-plan-rev-sub">{t('plan.revised.notDone')}</h4>
      )}
      {notDone.length > 0 && (
        <ul className="tv-bc-dropped">
          {notDone.map(({ item, count }) => (
            <li key={`${item.what}\n${item.why}`}>
              <span className="tv-bc-x">
                <IconCloseOutlineRegular aria-hidden />
              </span>
              <span>
                <span className="tv-bc-what">{sentenceOf(item.what, count)}</span>{' '}
                <span className="tv-bc-muted">{item.why}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {undoHintId && (
        <p id={undoHintId} className="tv-bc-note">
          {t('plan.undo.chatChange')}
        </p>
      )}
    </section>
  )
}

const randomEditId = () => `edit-${globalThis.crypto.randomUUID()}`

/**
 * The names of the sources of the owner's photos in the card's words: by their kinds (`fromKinds`) when the plan gives
 * one kind per name, each name as the plan has it otherwise.
 */
function ownPhotoSourcesOf(t: Translate, own: { from: string[]; fromKinds?: string[] }): string[] {
  const kinds =
    Array.isArray(own.fromKinds) && own.fromKinds.length === own.from.length ? own.fromKinds : null
  return own.from.map((name, i) => sourceNameOf(t, kinds?.[i], name))
}

/** The address of a draft picture (`GET /api/build-draft/pictures/:id`), the owner's own picture door. */
export const draftPictureUrl = (picture: string) => `/api/build-draft/pictures/${encodeURIComponent(picture)}`

export function PlanCard({
  plan,
  lastEdit = null,
  canUndo = false,
  lookSources = null,
  review = null,
  t,
  onEdit,
  onUndo,
  locale = 'en',
  newEditId = randomEditId,
  revised = null,
  onDismissRevised,
  onStale
}: PlanCardProps) {
  const [draft, setDraft] = useState<PlanDraft>({ plan, lastEdit, canUndo, lookSources, review })
  const [busy, setBusy] = useState(false)
  /** A refused change, said in the card's own words (`refusalOf`); false while nothing was refused. */
  const [failed, setFailed] = useState<{ key: StringKey; vars?: Record<string, string | number> } | false>(
    false
  )
  const [editing, setEditing] = useState<string | null>(null)
  /** The value focus goes back to once its editor closes, or its change is taken back. */
  const [refocus, setRefocus] = useState<string | null>(null)
  const undoHintId = useId()
  const ref = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  // A newer draft from outside (a plan the chat composed, the draft read again) replaces what the card holds.
  useEffect(
    () => setDraft({ plan, lastEdit, canUndo, lookSources, review }),
    [plan, lastEdit, canUndo, lookSources, review]
  )
  useEffect(() => {
    if (refocus === null || editing !== null) return
    const field = `[data-field="${CSS.escape(refocus)}"]`
    ref.current?.querySelector<HTMLElement>(`${field} .tv-bc-val-edit, ${field} input:checked`)?.focus()
    setRefocus(null)
  })
  const current = draft.plan
  const card: Card = planCardOf(current, {
    lookSources: draft.lookSources ?? null,
    review: draft.review ?? null
  })

  /** Every change to the plan: one structured plan edit, then the card follows the draft tracy-web answers with. */
  const follow = async (request: () => Promise<PlanDraft>) => {
    setBusy(true)
    setFailed(false)
    try {
      setDraft(await request())
    } catch (error) {
      const refused = refusalOf(error)
      setFailed({ key: refused.key, ...(refused.vars ? { vars: refused.vars } : {}) })
      // The plan moved meanwhile: the latest one is read, so the owner edits what is really there.
      if (refused.reload) onStale?.()
    } finally {
      setBusy(false)
    }
  }
  const send = (changes: { field: string; value: unknown }[]) =>
    follow(() => onEdit(planEditOf(current, changes, newEditId())))
  /** One plan operation (#575): a part taken off, brought back, or the original plan back. Focus goes to the title. */
  const operate = (operation: PlanOperation) => {
    setEditing(null)
    titleRef.current?.focus()
    void follow(() => onEdit(planOperationOf(current, operation, newEditId())))
  }

  const ctx: EditContext = {
    t,
    editing,
    busy,
    changed: new Set(changedFieldsOf(draft)),
    start: (field) => setEditing(field),
    cancel: (field) => {
      setEditing(null)
      setRefocus(field)
    },
    save: (field, value, text) => {
      setEditing(null)
      setRefocus(field)
      const change = planChangeOf(field, value, text)
      if (change) void send([change])
    }
  }

  const r: ReviewContext = { t, card, ctx, busy, locale, operate, send: (changes) => void send(changes) }
  // A dark theme accent (#616) is shown beside the light one, each labelled; the owner cannot edit it yet.
  const accentDark = card.look.accentDark
  const logo =
    card.look.logo.kind !== 'own'
      ? t('plan.look.logoText')
      : // A logo the machine drew from the owner's logo is not the owner's own file, and the row says so.
        draft.lookSources?.logo?.from === 'drawn-from-logo' || card.look.logo.code === 'logo_source_drawn'
        ? t('plan.look.logoDrawn')
        : t('plan.look.logoOwn', {
            source: logoSourceOf(t, card.look.logo, card.look.logo.source ?? '')
          })
  const drawn =
    card.pictures.generated.frames === 0
      ? t('plan.pictures.drawnNone')
      : plural(t, 'plan.pictures.drawnValue', card.pictures.generated.frames)
  const edited = editLinesOf(t, card, revised?.edits)
  const showNote =
    revised !== null && (revised.changed.length > 0 || revised.notDone.length > 0 || edited.length > 0)
  // A change made in the chat by a written request (the revise step) is taken back with Undo like a card edit, while
  // the draft offers it (`canUndo`). Only when it does not (a card edit replaced that undo, or a draft kept before
  // chat changes could be undone) does Undo stay disabled, and the note says why instead of leaving the owner to guess.
  const undoUnavailable =
    showNote && !draft.canUndo && (revised?.changed.length ?? 0) > 0 && (revised?.edits?.length ?? 0) === 0

  return (
    <article ref={ref} className="tv-bc-plan" aria-label={t('plan.title', { name: card.name })}>
      <div className="tv-bc-plan-h">
        <h3 ref={titleRef} tabIndex={-1} className="tv-bc-plan-t">
          {t('plan.title', { name: card.name })}
        </h3>
        <span className="tv-bc-chip" data-plain="">
          {t('plan.design', { name: card.look.template })}
        </span>
        <button
          type="button"
          className="tv-bc-btn"
          data-ghost=""
          aria-label={t('plan.undoLabel')}
          aria-describedby={undoUnavailable ? undoHintId : undefined}
          // Nothing to take back: disabled, so it is neither pressed nor reached by Tab. A change asked for in the chat
          // is offered with no card edit (`lastEdit` null).
          disabled={!draft.canUndo || busy}
          onClick={() => {
            setEditing(null)
            // Undo goes disabled once it is done, which would drop focus to the page: it goes to the value taken back,
            // or to the card's title when a chat change (no one value) is taken back.
            const taken = draft.lastEdit?.changes?.[0]?.field
            if (taken) setRefocus(taken)
            else titleRef.current?.focus()
            void follow(onUndo)
          }}
        >
          <UndoIcon />
          {t('plan.undo')}
        </button>
      </div>
      <EditsBar t={t} review={draft.review ?? null} busy={busy} onRevert={() => operate({ op: 'revert' })} />
      {failed && (
        <p className="tv-bc-plan-err tv-bc-error" role="alert">
          {t(failed.key, failed.vars)}
        </p>
      )}

      {showNote && revised && (
        <RevisionNoteView
          note={revised}
          edited={edited}
          t={t}
          lineContext={{ locale, facts: card.facts }}
          {...(undoUnavailable ? { undoHintId } : {})}
          onDismiss={() => {
            onDismissRevised?.()
            // The note takes its button with it: focus goes to the card's title, not to the page.
            titleRef.current?.focus()
          }}
        />
      )}

      <YouGet r={r} />
      <KeyMessages r={r} />

      <Section title={t('plan.facts')}>
        <div className="tv-bc-kv">
          {card.facts.map((f) => (
            <Row key={f.id} label={factLabelOf(t, f.kind, f.label)}>
              {f.choice ? (
                <Conflict
                  fact={f as PlanFact & { choice: NonNullable<PlanFact['choice']> }}
                  label={factLabelOf(t, f.kind, f.label)}
                  t={t}
                  busy={busy}
                  changed={ctx.changed.has(f.field)}
                  onPick={(value) => {
                    if (value !== f.value) void send([{ field: f.field, value }])
                  }}
                />
              ) : (
                <EditableValue
                  ctx={ctx}
                  field={f.field}
                  label={factLabelOf(t, f.kind, f.label)}
                  current={f.value}
                  text={factShownOf(t, f, locale)}
                  source={f.offSite ? t('plan.fact.offSite') : sourceNameOf(t, f.sourceKind, f.source)}
                />
              )}
            </Row>
          ))}
          <Row label={t('plan.language')}>
            <Value field="language" source={t('plan.allSources')}>
              {languageName(card.language, locale)}
            </Value>
          </Row>
        </div>
      </Section>

      <Section title={t('plan.look')}>
        <div className="tv-bc-kv">
          <Row label={t('plan.look.template')}>
            <Value field="look.template">{card.look.template}</Value>
          </Row>
          <Row label={t(accentDark === null ? 'plan.look.accent' : 'plan.look.accentLight')}>
            <EditableValue
              ctx={ctx}
              field="look.accent"
              label={t(accentDark === null ? 'plan.look.accent' : 'plan.look.accentLight')}
              current={card.look.accent}
              text={card.look.accent}
            >
              <span className="tv-bc-swatch" style={{ background: card.look.accent }} aria-hidden />
              {card.look.accent}
            </EditableValue>
          </Row>
          {accentDark !== null && (
            <Row label={t('plan.look.accentDark')}>
              <Value field="look.accentDark">
                <span className="tv-bc-swatch" style={{ background: accentDark }} aria-hidden />
                {accentDark}
              </Value>
            </Row>
          )}
          <Row label={t('plan.look.logoLight')}>
            <LogoOn ground="light" picture={card.look.brand?.logo.light ?? null} t={t}>
              {logo}
            </LogoOn>
          </Row>
          <Row label={t('plan.look.logoDark')}>
            <LogoOn ground="dark" picture={card.look.brand?.logo.dark ?? null} t={t}>
              {logo}
            </LogoOn>
          </Row>
        </div>
      </Section>

      <Section title={t('plan.services', { count: card.services.length })}>
        <div className="tv-bc-kv">
          {card.services.map((s, i) => (
            <Row key={s.id} label={t('plan.service', { n: i + 1 })}>
              <EditableValue
                ctx={ctx}
                field={s.field}
                label={t('plan.service', { n: i + 1 })}
                current={s.label}
                text={s.label}
                source={sourceNameOf(t, s.sourceKind, s.source)}
              />
            </Row>
          ))}
        </div>
      </Section>

      <Reach r={r} />
      <PagesView r={r} />

      <Section title={t('plan.pictures')}>
        <div className="tv-bc-kv">
          <Row label={t('plan.pictures.own')}>
            <Value>
              {/* The photos the plan places, beside all the owner's photos it holds when it holds more (#575). */}
              {plural(
                t,
                card.pictures.own.photos > card.pictures.own.frames
                  ? 'plan.pictures.ownOfValue'
                  : 'plan.pictures.ownValue',
                card.pictures.own.frames,
                {
                  total: card.pictures.own.photos,
                  from: listOf(t, ownPhotoSourcesOf(t, card.pictures.own))
                }
              )}
            </Value>
          </Row>
          <Row label={t('plan.pictures.drawn')}>
            {/* An estimate the picture step redraws from the owner's photos, so editing it would change nothing:
                shown, not offered, although the contract still lists the field as editable. */}
            <Value
              field="pictures.generated.frames"
              {...(card.pictures.generated.reason
                ? { note: picturesEstimateOf(t, card.pictures.generated, card.pictures.generated.reason) }
                : {})}
            >
              {drawn}
            </Value>
          </Row>
        </div>
      </Section>

      {card.assumptions.length > 0 && (
        <Section title={t('plan.assumptions')}>
          <ul className="tv-bc-plain">
            {card.assumptions.map((a) => (
              <li key={a.id}>{assumptionOf(t, a, a.said)}</li>
            ))}
          </ul>
        </Section>
      )}

      <NotOnSite r={r} />
      <Sources r={r} />
      <SearchView r={r} />
      <Later r={r} />
    </article>
  )
}

/**
 * The logo as the site shows it on a light or a dark ground (#575 C9): the brand step's picture through the owner's
 * picture door, on that ground; without a picture, the sentence of where the logo comes from.
 */
function LogoOn({
  ground,
  picture,
  t,
  children
}: {
  ground: 'light' | 'dark'
  picture: { picture: string } | null
  t: Translate
  children: string
}) {
  if (!picture) return <Value field="look.logo">{children}</Value>
  return (
    <figure className="tv-bc-logo" data-ground={ground} data-field="look.logo">
      <img
        src={draftPictureUrl(picture.picture)}
        alt={t(ground === 'light' ? 'plan.look.logoOnLight' : 'plan.look.logoOnDark')}
      />
      <figcaption className="tv-bc-note">{children}</figcaption>
    </figure>
  )
}
