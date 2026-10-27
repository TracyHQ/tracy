#!/usr/bin/env node
// Drive the real toggle, including persistence after reload. Never force the theme here.
import { chromium } from 'playwright';
import { config, launchOptions, navigate, readTheme, persisted, report } from './runtime.mjs';
const [url, width = '1366'] = process.argv.slice(2);
if (!url || !Number.isFinite(Number(width)) || Number(width) <= 0) throw new Error('toggle-test.mjs <url> [width] --config <file>');
const browser = await chromium.launch(launchOptions);
try {
  const ctx = await browser.newContext({ignoreHTTPSErrors:true, colorScheme:'light', viewport:{width:Number(width),height:900}});
  const page = await ctx.newPage();
  await navigate(page,url);
  const button = () => page.locator(config.toggle + ':visible').first();
  if (!await button().isVisible()) throw new Error('No visible toggle at this width');
  const surface = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const originalSurface = await surface();
  const initial = await readTheme(page);
  if (!['light','dark'].includes(initial)) throw new Error('Configured hook does not expose a theme');
  const other = initial === 'light' ? 'dark' : 'light';
  const settle = mode => page.waitForFunction(({hook,mode}) => {
    return hook.type === 'class' ? document.documentElement.classList.contains(hook.name) === (mode === 'dark')
      : document.documentElement.getAttribute(hook.name) === mode;
  }, {hook:config.hook,mode}, {timeout:5000});
  await button().click(); await settle(other);
  await page.waitForFunction(before => getComputedStyle(document.body).backgroundColor !== before, originalSurface, {timeout:5000});
  if (await persisted(page) !== other) throw new Error('Theme choice was not persisted');
  await page.reload({waitUntil:'load'}); await settle(other);
  await button().click(); await settle(initial);
  await page.waitForFunction(before => getComputedStyle(document.body).backgroundColor === before, originalSurface, {timeout:5000});
  if (await persisted(page) !== initial) throw new Error('Restored theme was not persisted');
  report(page, 1);
} catch(e) { console.error(JSON.stringify({status:'fail',error:e.message})); process.exitCode=1; }
finally { await browser.close(); }
