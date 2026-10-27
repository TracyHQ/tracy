/**
 * The stepped wizard every Tracy panel that walks a person through steps draws with: the segment
 * bar with "Step N of M", the sticky footer with Back / Skip / Continue, and their CSS (the `tas-`
 * classes). Moved out of `@tracy/dsh-add-site` (23/10/2026) so the site's Publish tab is the same
 * shell, not a copy of it.
 */
export { type WizardStep, WizardSteps, type WizardStepsWords } from './steps'
export { WizardFooter, type WizardFooterWords } from './footer'
export {
  WIZARD_ROOT_BASE_CSS,
  WIZARD_ROOT_BUTTON_CSS,
  WIZARD_ROOT_CSS,
  WIZARD_ROOT_LAYOUT_CSS
} from './root-css'
export { WIZARD_CSS } from './wizard-css'
export { CREATE_STEP_CSS } from './create-step-css'
