/** Open the real viewer pane, then wait for this copy's frame; source or unrelated frames never count. */
export function viewerWorkspaceUrl(workspace, origin) {
  const url = new URL(workspace, origin)
  url.searchParams.set('open', 'browser')
  url.searchParams.set('page', '/')
  url.searchParams.set('mode', 'edit')
  return url.href
}

export async function dismissWelcome(page, { timeoutMs = 60000 } = {}) {
  // A newly imported copy opens the Welcome dialog over that composer. Close it through the
  // same visible control a person uses before submitting the measured turn.
  const welcome = page.locator('.tv-welcome .tv-wl-close')
  if (await welcome.isVisible().catch(() => false)) {
    await welcome.click()
    await page.locator('.tv-welcome').waitFor({ state: 'hidden', timeout: timeoutMs })
  }
  // Closing Welcome can start the guided tour on the same newly imported site.
  const tourLayer = page.locator('.tv-tour')
  if (!(await tourLayer.isVisible().catch(() => false)))
    await tourLayer.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  const tour = page.locator('.tv-tour .tv-tour-link').first()
  if (await tour.isVisible().catch(() => false)) {
    await tour.click()
    await tourLayer.waitFor({ state: 'hidden', timeout: timeoutMs })
  }
  await page.locator('.tracy-boot-cover').waitFor({ state: 'hidden', timeout: timeoutMs })
}

export async function prepareViewer(page, copyAddress, { timeoutMs = 60000 } = {}) {
  // The workspace composer can render underneath Tracy's asynchronous boot cover.
  await page.locator('.tracy-boot-cover').waitFor({ state: 'hidden', timeout: timeoutMs })
  await dismissWelcome(page, { timeoutMs })
  const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true })
  if (await expand.isVisible().catch(() => false)) await expand.click()
  await page.locator('[role="textbox"][contenteditable]:visible').last().waitFor({ timeout: timeoutMs })
  const copyOrigin = new URL(copyAddress).origin
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const viewer = page.frames().find((frame) => {
      if (frame === page.mainFrame()) return false
      try {
        return new URL(frame.url()).origin === copyOrigin
      } catch {
        return false
      }
    })
    if (viewer) return viewer
    const open = page.getByRole('button', { name: 'Open right sidebar', exact: true })
    if (await open.isVisible().catch(() => false)) {
      // Boot hydration may open the pane or replace this button between visibility and click.
      // Retry the observation within our budget instead of waiting 30 seconds on a vanished button.
      await open.click({ timeout: Math.max(1, Math.min(1000, deadline - Date.now())) }).catch(() => {})
    }
    await page.waitForTimeout(250)
  }
  throw new Error('No live imported-copy viewer iframe; refusing a source or NO_VIEWER benchmark')
}
