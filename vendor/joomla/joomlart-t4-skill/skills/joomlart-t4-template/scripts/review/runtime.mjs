// Shared browser contract for every scanner. Configure the observed template, not guessed hooks.
import { readFileSync } from 'node:fs';
const i = process.argv.indexOf('--config');
const path = i < 0 ? process.env.T4_REVIEW_CONFIG : process.argv[i + 1];
if (i >= 0) { if (!path) throw new Error('--config needs a JSON file'); process.argv.splice(i, 2); }
export const config = path ? JSON.parse(readFileSync(path, 'utf8')) : {
  hook: { type: 'class', name: 't4-dark' }, toggle: '.t4-theme-toggle',
  persistence: { type: 'localStorage', key: 't4-theme' }, expectedSelectors: [], expectedStatus: 200
};
export const configured = Boolean(path);
export function validateConfig(c) {
  if (!['class','attribute'].includes(c.hook?.type) || !/^[a-zA-Z][\w-]*$/.test(c.hook?.name ?? '')) throw new Error('hook requires type class|attribute and a name');
  if (!['cookie','localStorage'].includes(c.persistence?.type) || !c.persistence.key) throw new Error('persistence requires type cookie|localStorage and key');
  if (!c.toggle || !Array.isArray(c.expectedSelectors) || c.expectedSelectors.some(s => typeof s !== 'string' || !s)) throw new Error('toggle and expectedSelectors are required');
}
validateConfig(config);
export const launchOptions = { args: ['--disable-features=MacAppCodeSignClone'] };
export async function setTheme(page, mode) {
  await page.evaluate(({hook, mode}) => {
    const root = document.documentElement;
    if (hook.type === 'class') root.classList.toggle(hook.name, mode === 'dark');
    else root.setAttribute(hook.name, mode);
  }, {hook: config.hook, mode});
}
export async function readTheme(page) {
  return page.evaluate(hook => hook.type === 'class'
    ? (document.documentElement.classList.contains(hook.name) ? 'dark' : 'light')
    : document.documentElement.getAttribute(hook.name), config.hook);
}
export async function persisted(page) {
  if (config.persistence.type === 'cookie') {
    const cookies = await page.context().cookies(page.url());
    return cookies.find(c => c.name === config.persistence.key)?.value ?? null;
  }
  return page.evaluate(key => localStorage.getItem(key), config.persistence.key);
}
export async function navigate(page, url) {
  const response = await page.goto(url, {waitUntil:'load', timeout:60000});
  const expected = config.expectedStatus ?? 200;
  if (!response || response.status() !== expected) throw new Error(`HTTP ${response?.status()} expected ${expected}`);
  if (new URL(page.url()).origin !== new URL(url).origin) throw new Error('Unexpected cross-origin redirect');
  for (const selector of config.expectedSelectors) {
    if (!await page.locator(selector).first().isVisible()) throw new Error(`Expected visible page element missing: ${selector}`);
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
export function resultStatus({examined, findings = [], failure = false, verified = true}) {
  if (failure || examined === 0) return 'fail';
  return findings.length || !verified ? 'needs-review' : 'pass';
}
export function report(page, examined, findings = [], failure = false) {
  const status = resultStatus({examined, findings, failure, verified: configured && config.expectedSelectors.length > 0});
  console.log(JSON.stringify({status, url:page.url(), examined, findings, configured}));
  process.exitCode = status === 'pass' ? 0 : status === 'fail' ? 1 : 3;
}
