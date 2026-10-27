import {
  Badge,
  Button,
  Card,
  Input,
  NativeSelect,
  NativeSelectOption,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { useEffect } from 'react'
import type { Page, RecipientDetail, RecipientSummary } from './real-api'
import { contentStatusLabel } from './real-format'
import { useT } from '../i18n'
export function RealRecipients({
  page,
  detail,
  groups,
  group,
  state,
  search,
  busy,
  onFilter,
  onSelect,
  onNext,
  onReview
}: {
  page: Page<RecipientSummary> | null
  detail: RecipientDetail | null
  groups: { key: string; label: string }[]
  group: string
  state: string
  search: string
  busy: boolean
  onFilter: (field: 'group' | 'state' | 'search', value: string) => void
  onSelect: (id: string) => void
  onNext: () => void
  onReview: () => void
}) {
  const t = useT()
  // The detail opens above the list; bring it into view when a row further down is chosen.
  useEffect(() => {
    if (detail) document.querySelector('[data-recipient-detail]')?.scrollIntoView?.({ block: 'start' })
  }, [detail?.id])
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <NativeSelect
          aria-label={t('invitations-real.recipients.groupAria')}
          value={group}
          disabled={busy}
          onChange={(e) => onFilter('group', e.target.value)}
        >
          <NativeSelectOption value="">{t('invitations-real.common.allGroups')}</NativeSelectOption>
          {groups.map((g) => (
            <NativeSelectOption key={g.key} value={g.key}>
              {g.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t('invitations-real.recipients.stateAria')}
          value={state}
          disabled={busy}
          onChange={(e) => onFilter('state', e.target.value)}
        >
          <NativeSelectOption value="">{t('invitations-real.recipients.allStates')}</NativeSelectOption>
          <NativeSelectOption value="suppressed">
            {t('invitations-real.recipients.blocked')}
          </NativeSelectOption>
          <NativeSelectOption value="recheck">{t('invitations-real.recipients.recheck')}</NativeSelectOption>
        </NativeSelect>
        <Input
          aria-label={t('invitations-real.recipients.searchAria')}
          autoComplete="off"
          value={search}
          disabled={busy}
          onChange={(e) => onFilter('search', e.target.value)}
          placeholder={t('invitations-real.common.searchPlaceholder')}
        />
      </div>
      {detail ? (
        <Card className="gap-3 p-4" data-recipient-detail>
          <h3 className="font-semibold">{detail.email}</h3>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{detail.state}</Badge>
            <span>{detail.reasons.join(' · ')}</span>
          </div>
          <p>{t('invitations-real.recipients.snapshotNote')}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={onReview}>
              {t('invitations-real.recipients.review')}
            </Button>
          </div>
          <dl className="grid gap-2 md:grid-cols-2">
            {detail.rawSource.headers.map((header, i) => (
              <div data-source-field key={i} className="min-w-0 rounded-md border p-2">
                <dt className="text-muted-foreground text-xs">{header}</dt>
                <dd className="break-words text-sm">
                  {detail.rawSource.values[i] || t('invitations-real.recipients.empty')}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}
      <p className="text-muted-foreground text-sm">
        {page
          ? t('invitations-real.recipients.matching', { total: page.total })
          : t('invitations-real.common.readingRecipients')}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('invitations-real.recipients.col.recipient')}</TableHead>
            <TableHead>{t('invitations-real.recipients.col.group')}</TableHead>
            <TableHead>{t('invitations-real.common.sourceState')}</TableHead>
            <TableHead>{t('invitations-real.recipients.col.content')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page?.items.map((r) => (
            <TableRow
              key={r.id}
              aria-selected={r.id === detail?.id}
              className={r.id === detail?.id ? 'bg-primary/10' : undefined}
            >
              <TableCell>
                <Button variant="link" disabled={busy} onClick={() => onSelect(r.id)}>
                  {r.email}
                </Button>
              </TableCell>
              <TableCell>{r.groupLabel}</TableCell>
              <TableCell>{r.state}</TableCell>
              <TableCell>{contentStatusLabel(t, r.contentStatus)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button variant="outline" disabled={busy || !page?.nextCursor} onClick={onNext}>
        {t('invitations-real.recipients.next')}
      </Button>
    </div>
  )
}
