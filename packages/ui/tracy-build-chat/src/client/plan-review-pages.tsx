/**
 * The pages of the plan card (#575, the card the owner reviewed; C10 of the review): what every page shares (the menu,
 * the header and the footer) said once, then each page with its main point, its numbered sections with what each
 * holds, the key messages it carries and where the page ends, the notes for the writer folded, and a trash button on
 * each part the kit lets the owner take off. Then the standard pages and each page's search intent with its terms.
 */
import { Fragment, useState } from 'react'
import { EditableValue } from './EditableValue'
import { BlockLists, Fold, holdsText, listOf, onceEach, plural, Section, Trash } from './plan-card-parts'
import { sectionLabelOf } from './plan-codes'
import type { ReviewContext } from './plan-review-top'
import { factLabelOf } from './plan-words'

/** The facts of the header or the footer as one sentence in the card's words. */
const factsText = (r: ReviewContext, facts: ReviewContext['card']['site']['footer']) =>
  listOf(r.t, onceEach(facts.map((f) => factLabelOf(r.t, f.kind, f.label))))

/** What every page shares, said once (never under each page). */
function EveryPage({ r }: { r: ReviewContext }) {
  const { t, card } = r
  const { menu, header, footer, privacyLink } = card.site
  const footerFacts = factsText(r, footer)
  return (
    <div className="tv-bc-every">
      <div className="tv-bc-ph">{t('plan.pages.every')}</div>
      {menu.length > 0 && (
        <div className="tv-bc-menu">
          <span className="tv-bc-k">{t('plan.pages.menu')}</span>
          <ul className="tv-bc-chips">
            {menu.map((name) => (
              <li key={name} className="tv-bc-chip" data-plain="">
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {header.length > 0 && (
        <p className="tv-bc-note">{t('plan.pages.header', { facts: factsText(r, header) })}</p>
      )}
      {(footer.length > 0 || privacyLink) && (
        <p className="tv-bc-note">
          {t('plan.pages.footer', {
            facts: privacyLink
              ? listOf(t, [...(footerFacts ? [footerFacts] : []), t('plan.pages.privacyLink')])
              : footerFacts
          })}
        </p>
      )}
    </div>
  )
}

/** One page: its main point, its sections, its notes for the writer. */
function PageView({
  r,
  page,
  open
}: {
  r: ReviewContext
  page: ReviewContext['card']['sitePages'][number]
  open: boolean
}) {
  const { t, card, ctx, busy, operate } = r
  const blocks = new Map((card.pages.find((p) => p.id === page.id)?.blocks ?? []).map((b) => [b.id, b]))
  const messages = page.sections.filter((s) => s.message !== undefined)
  return (
    <div className="tv-bc-page" data-page={page.id}>
      <div className="tv-bc-page-h">
        <Fold summary={page.name} count={plural(t, 'plan.sections', page.sections.length)} open={open}>
          {page.keyMessage !== undefined && (
            <div className="tv-bc-kv">
              <div className="tv-bc-k">{t('plan.page.keyMessage')}</div>
              <div className="tv-bc-cell">
                <EditableValue
                  ctx={ctx}
                  field={`pages[${page.id}].keyMessage`}
                  label={t('plan.page.keyMessage')}
                  current={page.keyMessage}
                  text={page.keyMessage}
                />
              </div>
            </div>
          )}
          <ol className="tv-bc-secs">
            {page.sections.map((s) => {
              const block = blocks.get(s.id)
              const label = sectionLabelOf(t, s.labelCode, s.label)
              return (
                <li key={s.id} data-block={s.id}>
                  <div className="tv-bc-msg-row">
                    <span className="tv-bc-bn">{label}</span>
                    {s.removable && (
                      <Trash
                        t={t}
                        what={label}
                        busy={busy}
                        onRemove={() => operate({ op: 'remove-block', page: page.id, block: s.id })}
                      />
                    )}
                  </div>
                  {block && s.items.length === 0 && (
                    <div className="tv-bc-val" data-field={`pages[${page.id}].blocks[${s.id}].data`}>
                      <span className="tv-bc-v">{holdsText(t, block.holds)}</span>
                    </div>
                  )}
                  {s.items.length > 0 && (
                    <ul className="tv-bc-chips" data-field={`pages[${page.id}].blocks[${s.id}].data`}>
                      {s.items.map((i) => (
                        <li key={i.id} className="tv-bc-chip" data-plain="">
                          {i.label}
                          {i.removable && (
                            <Trash
                              t={t}
                              what={i.label}
                              busy={busy}
                              onRemove={() =>
                                operate({ op: 'remove-item', page: page.id, block: s.id, item: i.id })
                              }
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(s.carries.length > 0 || s.end || s.library || block?.trade) && (
                    <ul className="tv-bc-tags">
                      {s.carries.map((c) => (
                        <li key={c.id} className="tv-bc-chip" data-accent="">
                          {c.label}
                        </li>
                      ))}
                      {s.end && <li className="tv-bc-chip">{t('plan.tag.end')}</li>}
                      {s.library && <li className="tv-bc-chip">{t('plan.tag.library')}</li>}
                    </ul>
                  )}
                  {block?.trade && <div className="tv-bc-trade tv-bc-note">{t('plan.trade')}</div>}
                  {block?.lists && <BlockLists lists={block.lists} />}
                </li>
              )
            })}
          </ol>
          {(page.visitorQuestion !== undefined || messages.length > 0) && (
            <Fold summary={t('plan.page.notes')}>
              <div className="tv-bc-kv">
                {page.visitorQuestion !== undefined && (
                  <>
                    <div className="tv-bc-k">{t('plan.page.visitorQuestion')}</div>
                    <div className="tv-bc-cell">
                      <EditableValue
                        ctx={ctx}
                        field={`pages[${page.id}].visitorQuestion`}
                        label={t('plan.page.visitorQuestion')}
                        current={page.visitorQuestion}
                        text={page.visitorQuestion}
                      />
                    </div>
                  </>
                )}
                {messages.map((s) => {
                  const label = sectionLabelOf(t, s.labelCode, s.label)
                  return (
                    // Both cells sit in the notes grid itself: a wrapper would squeeze the pair into the label column.
                    <Fragment key={s.id}>
                      <div className="tv-bc-k">{label}</div>
                      <div className="tv-bc-cell">
                        <EditableValue
                          ctx={ctx}
                          field={`pages[${page.id}].blocks[${s.id}].message`}
                          label={label}
                          current={s.message as string}
                          text={s.message as string}
                        />
                      </div>
                    </Fragment>
                  )
                })}
              </div>
            </Fold>
          )}
        </Fold>
        {page.removable && (
          <Trash
            t={t}
            what={page.name}
            busy={busy}
            onRemove={() => operate({ op: 'remove-page', page: page.id })}
          />
        )}
      </div>
    </div>
  )
}

/** The privacy page and the page shown for an address that does not exist, folded. */
function Standard({ r }: { r: ReviewContext }) {
  const { t, card } = r
  const { privacy, notFound } = card.standard
  if (!privacy && !notFound) return null
  return (
    <Fold summary={t('plan.standard')} count={t('plan.standard.sum')}>
      <div className="tv-bc-kv">
        {privacy && (
          <>
            <div className="tv-bc-k">{t('plan.standard.privacy')}</div>
            <div className="tv-bc-cell">
              {t('plan.standard.privacyFrom', {
                facts: listOf(t, onceEach(privacy.facts.map((f) => factLabelOf(t, f.kind, f.label))))
              })}
            </div>
          </>
        )}
        {notFound && (
          <>
            <div className="tv-bc-k">{t('plan.standard.notFound')}</div>
            <div className="tv-bc-cell">
              {t('plan.standard.notFoundLine', { pages: listOf(t, notFound.leadsTo) })}
            </div>
          </>
        )}
      </div>
    </Fold>
  )
}

export function PagesView({ r }: { r: ReviewContext }) {
  const { t, card } = r
  return (
    <Section title={t('plan.pages', { count: card.pages.length })}>
      <EveryPage r={r} />
      {card.sitePages.map((p, i) => (
        <PageView key={p.id} r={r} page={p} open={i === 0} />
      ))}
      <Standard r={r} />
      <p className="tv-bc-note">{t('plan.writtenAfter')}</p>
    </Section>
  )
}

/** One page's search intent: the title and description it aims for, and its terms the owner adds and removes. */
function PageSearch({ r, page }: { r: ReviewContext; page: ReviewContext['card']['sitePages'][number] }) {
  const { t, ctx, busy, send } = r
  const [typed, setTyped] = useState('')
  const seo = page.seo
  if (!seo) return null
  const field = `pages[${page.id}].seo.searchTerms`
  const add = () => {
    const term = typed.trim()
    if (term === '' || busy) return
    setTyped('')
    send([{ field, value: [...seo.searchTerms, term] }])
  }
  return (
    <div className="tv-bc-page" data-page={page.id}>
      <div className="tv-bc-ph">{page.name}</div>
      <div className="tv-bc-kv">
        {seo.titleIntent !== undefined && (
          <>
            <div className="tv-bc-k">{t('plan.search.title')}</div>
            <div className="tv-bc-cell">
              <EditableValue
                ctx={ctx}
                field={`pages[${page.id}].seo.titleIntent`}
                label={t('plan.search.title')}
                current={seo.titleIntent}
                text={seo.titleIntent}
              />
            </div>
          </>
        )}
        {seo.descriptionIntent !== undefined && (
          <>
            <div className="tv-bc-k">{t('plan.search.description')}</div>
            <div className="tv-bc-cell">
              <EditableValue
                ctx={ctx}
                field={`pages[${page.id}].seo.descriptionIntent`}
                label={t('plan.search.description')}
                current={seo.descriptionIntent}
                text={seo.descriptionIntent}
              />
            </div>
          </>
        )}
        <div className="tv-bc-k">{t('plan.search.terms')}</div>
        <div className="tv-bc-cell" data-field={field}>
          <ul className="tv-bc-chips">
            {seo.searchTerms.map((term) => (
              <li key={term} className="tv-bc-chip" data-plain="">
                {term}
                {/* The last term stays: a page keeps at least one. */}
                {seo.searchTerms.length > 1 && (
                  <button
                    type="button"
                    className="tv-bc-btn tv-bc-trash"
                    data-ghost=""
                    aria-label={t('plan.search.removeTerm', { term })}
                    aria-disabled={busy || undefined}
                    onClick={() => {
                      if (!busy) send([{ field, value: seo.searchTerms.filter((x) => x !== term) }])
                    }}
                  >
                    {'×'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="tv-bc-edit">
            <input
              value={typed}
              maxLength={60}
              aria-label={t('plan.search.addLabel', { page: page.name })}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  add()
                }
              }}
            />
            <button
              type="button"
              className="tv-bc-btn"
              data-ghost=""
              aria-disabled={busy || undefined}
              onClick={add}
            >
              {t('plan.search.add')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SearchView({ r }: { r: ReviewContext }) {
  const pages = r.card.sitePages.filter((p) => p.seo !== null)
  if (pages.length === 0) return null
  return (
    <Section title={r.t('plan.search')}>
      {pages.map((p) => (
        <PageSearch key={p.id} r={r} page={p} />
      ))}
    </Section>
  )
}
