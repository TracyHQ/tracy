/**
 * The screen's stylesheet (`onboard.css`), injected once into dsh's page by `apply()`, plus the
 * shared AI-account cards' CSS from `@tracy/dsh-model-plan/account-cards.css` (the cards and the
 * connect panel of step 2 are Settings' component since 12/10/2026; their rules left onboard.css
 * with them) and the Language row's own CSS from `@tracy/dsh-settings/language-row` (the row is
 * Settings' component, and its look must not depend on Settings' dialog being around it), then the
 * tour's and the Welcome popup's own sheets (`tour.css`, `welcome.css`). Every
 * `.css` import arrives as text (`scripts/build-client.mjs`).
 */
import ACCOUNT_CARDS_CSS from '@tracy/dsh-model-plan/account-cards.css'
import { LANGUAGE_ROW_CSS } from '@tracy/dsh-settings/language-row'
import css from './onboard.css'
import tourCss from './tour.css'
import welcomeCss from './welcome.css'

export const STYLES: string = css + ACCOUNT_CARDS_CSS + LANGUAGE_ROW_CSS + tourCss + welcomeCss
