import assert from 'node:assert/strict'

export const currentStep = (page) => page.locator('[data-wizard-current]').getAttribute('data-wizard-current')

/** Navigate through the actual step controls, preserving all choices already entered. */
export async function goToStep(page, target) {
  await page.locator('[data-wizard-current]').waitFor({ timeout: 8000 })
  await page.waitForFunction(() => !document.querySelector('[data-wizard-step][aria-busy="true"]'), null, {
    timeout: 8000
  })
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await currentStep(page)
    if (current === target) return
    const back = page.locator(`[data-wizard-goto="${target}"]`)
    if ((await back.count()) && (await back.isEnabled())) {
      await back.click()
      await page.locator(`[data-wizard-current="${target}"]`).waitFor({ timeout: 5000 })
      continue
    }
    if (current === 'source') {
      await page.getByText('Create a new site', { exact: true }).click()
    } else if (current === 'address') {
      const address = page.getByRole('textbox', { name: 'Site address', exact: true })
      if (!(await address.inputValue())) await address.fill('wizard-fixture')
      await page.locator('[data-wizard-continue]').click()
    } else if (current === 'customize' || current === 'system') {
      await page.locator('[data-wizard-continue]').click()
    } else {
      await page.locator('[data-wizard-continue]').click()
    }
    await page.waitForFunction(
      (previous) =>
        document.querySelector('[data-wizard-current]')?.getAttribute('data-wizard-current') !== previous,
      current,
      { timeout: 5000 }
    )
  }
  assert.fail(`Could not reach ${target}; current step is ${await currentStep(page)}`)
}

export async function setAddress(page, value) {
  await goToStep(page, 'address')
  await page.getByRole('textbox', { name: 'Site address', exact: true }).fill(value)
}

export async function submitCreate(page, value) {
  if (value) await setAddress(page, value)
  await goToStep(page, 'review')
  await page.getByRole('button', { name: 'Create site', exact: true }).click()
}
