/**
 * Which page of the Add site form usage records now (`wizardStep`, tracy-web `WIZARD_STEPS`), as
 * `<origin>:<page>`, or null while nothing is to be said: the build console, or the import wizard
 * before it has told which page it shows.
 *
 * 🔒 PLAIN JAVASCRIPT, like `create-navigation.mjs`: `test/wizard-usage.test.mjs` runs it with
 * `node --test`, no build step.
 * @param {{stageAt: string, currentStep: string, activeStep: string, origin: string, businessOn: boolean, importPage: string | null}} input
 * @returns {string | null}
 */
export function wizardStepName({ stageAt, currentStep, activeStep, origin, businessOn, importPage }) {
  if (stageAt !== 'form') return null
  if (currentStep === 'source') return 'start:source'
  if (origin === 'import') return importPage ? `import:${importPage}` : null
  // Build from my business behind a switch that is off lands on Create (`shownOrigin` in `wizard.tsx`).
  if (origin === 'business' && businessOn) return 'business:start'
  return `create:${activeStep}`
}
