/** Step 1 of an Owner's Publish tab: put the site online with Tracy, or download it as a ZIP. */
import type { JSX } from 'react'
import { Lightbulb } from 'lucide-react'
import { RadioGroup } from '@tracy/ui'
import { ChoiceOption } from '../../../../../site/tracy-site-build-core/src/client/ask-form/primitives'
import type { Translate } from '../../team/translate'
import type { PublishKind } from './plan'
import { StepPage } from './page'

export function KindStep({
  kinds,
  chosen,
  onChoose,
  onContinue,
  t
}: {
  kinds: PublishKind[]
  chosen: PublishKind | null
  onChoose: (kind: PublishKind) => void
  onContinue: () => void
  t: Translate
}): JSX.Element {
  return (
    <StepPage
      step="kind"
      title={t('flow.kind.title')}
      desc={t('flow.kind.desc')}
      // No Continue until a kind is chosen: hidden, not greyed.
      footer={chosen === null ? {} : { primary: { label: t('flow.continue'), onPress: onContinue } }}
      t={t}
    >
      <RadioGroup
        value={chosen ?? ''}
        onValueChange={(value) => onChoose(value as PublishKind)}
        className="gap-2"
        aria-label={t('flow.kind.title')}
        data-publish-kinds
      >
        {kinds.map((kind) => (
          <ChoiceOption
            key={kind}
            value={kind}
            selected={chosen === kind}
            title={t(`flow.kind.${kind}`)}
            description={t(`flow.kind.${kind}Desc`)}
            hint={
              <>
                <Lightbulb aria-hidden className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="font-semibold">{t('flow.kind.bestIf')}</span> {t(`flow.kind.${kind}Best`)}
                </span>
              </>
            }
          />
        ))}
      </RadioGroup>
    </StepPage>
  )
}
