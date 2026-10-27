/**
 * Every namespace Tracy owns, mapped to the `en` dictionary of the plugin that owns it.
 *
 * Two gates read it: `check-dsh-locale` (Vietnamese, with Tracy's keep-verbatim rules) and
 * `check-interface-languages` (every supported language, with the debt ledger). One list, so the
 * two can never disagree about which namespaces exist.
 *
 * Adding a Tracy namespace = one line here. Explicit rather than a directory scan: a namespace that
 * appears in a translation folder without a declared owner is something `check-dsh-locale` must
 * catch, not silently accept; it also checks the reverse (a package declaring `NS` in its
 * `strings.ts` that is missing here).
 */
import { en as brandEn } from '../../packages/brand/tracy-brand/src/client/strings.ts'
import { en as brandEngineEn } from '../../packages/design/tracy-brand-engine/src/client/strings.ts'
import { en as designInspirationEn } from '../../packages/design/tracy-design-inspiration/src/client/strings.ts'
import { en as addSiteEn } from '../../packages/site/tracy-add-site/src/client/strings.ts'
import { en as inboxEn } from '../../packages/site/tracy-inbox/src/client/strings.ts'
import { en as mySitesEn } from '../../packages/site/tracy-my-sites/src/client/strings.ts'
import { en as siteBuildEmdashEn } from '../../packages/site/tracy-site-build-emdash/src/client/strings.ts'
import { en as siteBuildJoomlaEn } from '../../packages/site/tracy-site-build-joomla/src/client/strings.ts'
import { en as siteBuildWordpressEn } from '../../packages/site/tracy-site-build-wordpress/src/client/strings.ts'
import { en as siteTabsEn } from '../../packages/site/tracy-site-tabs/src/client/strings.ts'
import { en as websiteOpportunitiesEn } from '../../packages/site/tracy-website-opportunities/src/client/strings.ts'
import { en as askFormEn } from '../../packages/ui/tracy-ask-form/src/client/strings.ts'
import { en as assistantEn } from '../../packages/ui/tracy-assistant/src/client/strings.ts'
import { en as chatInputEn } from '../../packages/ui/tracy-chat-input/src/client/strings.ts'
import { en as modePickerEn } from '../../packages/ui/tracy-mode-picker/src/client/strings.ts'
import { en as modelPlanEn } from '../../packages/ui/tracy-model-plan/src/client/strings.ts'
import { en as onboardEn } from '../../packages/ui/tracy-onboard/src/client/strings.ts'
import { en as settingsEn } from '../../packages/ui/tracy-settings/src/client/strings.ts'
import { en as sidebarEn } from '../../packages/ui/tracy-sidebar/src/client/strings.ts'
import { en as tabLinkEn } from '../../packages/ui/tracy-tab-link/src/client/strings.ts'

/** Tracy namespace → the owning plugin's English strings. */
export const OWNED: Record<string, Record<string, string>> = {
  'tracy-settings': settingsEn,
  'tracy-chat-input': chatInputEn,
  'tracy-add-site': addSiteEn,
  'tracy-my-sites': mySitesEn,
  'tracy-inbox': inboxEn,
  'tracy-site-tabs': siteTabsEn,
  'tracy-brand': brandEn,
  'tracy-sidebar': sidebarEn,
  'tracy-tab-link': tabLinkEn,
  'tracy-mode-picker': modePickerEn,
  'tracy-design-inspiration': designInspirationEn,
  'tracy-brand-engine': brandEngineEn,
  'tracy-site-build-wordpress': siteBuildWordpressEn,
  'tracy-site-build-joomla': siteBuildJoomlaEn,
  'tracy-site-build-emdash': siteBuildEmdashEn,
  'tracy-ask-form': askFormEn,
  'tracy-assistant': assistantEn,
  'tracy-model-plan': modelPlanEn,
  'tracy-onboard': onboardEn,
  'tracy-website-opportunities': websiteOpportunitiesEn
}
