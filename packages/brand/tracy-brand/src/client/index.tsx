/**
 * `@tracy/dsh-brand` — Tracy's coat on the dsh Web client.
 *
 * One package, four jobs, because they are one decision — nobody wants Tracy's mark on dsh's
 * colours or the other way round:
 *
 *   1. Identity: the mark and wordmark in dsh's three brand slots.
 *   2. Palette: Tracy's tokens handed to dsh's theme service as a layer of literals. This is the
 *      mechanism dsh provides (`ctx.theme.overrideTokens`); the presenter writes the layer inline
 *      on <body>, which beats every stylesheet. The previous attempt (`@tracy/dsh-tokens`, a
 *      <style> tag carrying `var()` on both sides) formed a CSS variable cycle and computed to
 *      nothing in dark mode — measured 2026-09-03.
 *   3. Chrome: the tab title and favicon, which dsh bakes in at build time and exposes no slot for.
 *   4. Three rows in General settings — Primary color and the two fonts. Since dsh 0.1.7 they edit
 *      this entry's volatile Config through dsh's `configForms` service (written to the profile's
 *      `cordis.patch.yml`), and they exist only while dsh serves that form. Tracy's bundles turn
 *      dsh's `settings` service off everywhere (one dsh serves every site, so a browser must never
 *      write the shared profile), so today the rows appear in no Tracy profile — measured 26/09/2026
 *      on loopback too; brand values are set in the bundle's `tracy-brand` row. The rows stay so a
 *      profile that does enable `settings` (a single-tenant desktop) gets them for free.
 */
import { PALETTE } from './generated'
import {
  CodeFontRow,
  FontSizeRow,
  GlobalFontRow,
  PrimaryColorRow,
  type BrandScope,
  type ThemeFace
} from './rows'
import { AppearanceRow, type AppearanceFace } from './appearance-row'
import { en, NS } from './strings'
import { CSS } from './styles'
import { installFavicon, installStyles, installTitle, syncFontLinks } from './dom'
import {
  BOOT_GLOBAL,
  CODE_FONT_FIELD,
  GLOBAL_FONT_FIELD,
  PRIMARY_FIELD,
  SETTINGS_NS
} from '../shared/settings.mjs'
import { createBrandValues } from '../shared/brand-values.mjs'
import { composeLayer, fontStylesheets } from '../shared/theme.mjs'
import { TracyMark, TracyName } from '@tracy/ui/brand'
import { uiSwitches } from '@tracy/core/ui-switches'
import { BootCover } from './boot-cover'

/** The layer's source id on the theme service — one per package, re-calling replaces it. */
const SOURCE = '@tracy/dsh-brand'

/**
 * Below dsh's own occupant (priority 0). Single slots render the LOWEST priority, so this wins
 * wherever `ui-brand-official` is still alive (the guest bundle) instead of depending on which
 * package happened to register first — the tie measured on the onboarding lane on 2026-09-02.
 */
const PRIORITY = -1

interface ThemeService {
  overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void
  getTheme(): { fontSize: number; preference: string }
  setFontSize(px: number): void
  setTheme(id: string): void
}

interface SlotsService {
  inject(name: string, register: () => unknown): () => void
  register(spec: Record<string, unknown>, component: unknown): unknown
}

interface LocaleService {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): unknown
}

/** The slice of dsh's `configForms` service (ui-settings, dsh 0.1.7) this plugin uses. */
interface ConfigForms {
  get(entryId: string): BrandScope
  whileServed(entryIds: readonly string[], register: () => () => void): () => void
}

interface FormsContext {
  effect(fn: () => (() => void) | void, label?: string): void
  slots: SlotsService
  configForms: ConfigForms
}

interface ClientContext {
  effect(fn: () => (() => void) | void, label?: string): void
  on(event: string, listener: () => void): () => void
  inject(services: string[], callback: (scope: FormsContext) => void): void
  slots: SlotsService
  theme: ThemeService
  locale: LocaleService
}

/**
 * `configForms` is deliberately NOT here: cordis has no optional injection, and a profile without
 * dsh's settings service (the fleet turns it off) would then never activate this plugin — no mark,
 * no palette, no title. It is taken through a nested `ctx.inject` below instead.
 */
export const inject = ['slots', 'theme', 'locale']

/**
 * `crypto.randomUUID` exists only in a secure context (https, or localhost). A Tracy page served
 * over plain http on any other name — the local stand at `tracy.test:8080`, a demo boot on
 * `<name>.tracy.test:<port>` — has `crypto` without it, and dsh 0.1.7's client (ui-sidebar-right's
 * `createTab`, the sidebar's Side Chat, ui-conversation, file-upload, shortcuts) as well as Tracy's
 * Build form call it unguarded: the right column's tabs then crash with "crypto.randomUUID is not
 * a function" while https deployments never see it (measured 26/09/2026). `getRandomValues` is
 * available everywhere, so the missing function is filled once here, in the plugin every profile
 * loads first, with the same v4 shape — and only when it is missing, so a secure context keeps the
 * platform's own implementation.
 */
function ensureRandomUuid(): void {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string }
  if (!c || typeof c.getRandomValues !== 'function' || typeof c.randomUUID === 'function') return
  c.randomUUID = () => {
    const b = c.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }
}
ensureRandomUuid()

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en }) as (() => void) | void, 'tracy-brand: dictionaries')

  // Three of this plugin's hide rules (styles.ts) key on <html data-tracy-hide>, the operator's
  // switches. Ask for them here, synchronously and before the sheet goes in, so the attribute is
  // on the page whichever Tracy plugin loads first — no flash of a piece that is off by default.
  uiSwitches()

  // 1. Identity — three separate injects, so a deployment without the sidebar still gets the hero mark.
  const mark = ({ size }: { size?: number }) => <TracyMark size={size} />
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.register({ name: 'sidebar.brand.mark', priority: PRIORITY }, mark)
  )
  ctx.slots.inject('sidebar.brand.name', () =>
    ctx.slots.register({ name: 'sidebar.brand.name', priority: PRIORITY }, TracyName)
  )
  // The hero of a site's blank conversation: the mark and one line beside it, as the first-run
  // screen has "Let's build your first site" (Akemi, 29/09). dsh's slot here holds ONE occupant, so
  // the line rides in the mark's own component rather than a second one. The first-run screen hides
  // this whole stack while its own mark and title are up, so the two never show together.
  // 36 px, not the size dsh hands the slot (34): the first-run mark beside its title is 36, and the
  // two screens must match (Akemi, 29/09 — measured font, size, weight, colour, gap: all equal).
  const heroMark = ({ t }: { t?: (key: string) => string }) => (
    <span className="tb-hero">
      <TracyMark size={36} />
      <span className="tb-hero-title">{t ? t('hero.title') : en['hero.title']}</span>
    </span>
  )
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark', priority: PRIORITY, locale: NS }, heroMark)
  )

  // 1b. The boot cover — see boot-cover.tsx for why dsh's own splash cannot do this job.
  // A list slot, so this ADDS to the overlay rather than shadowing whatever else lives there.
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: 'tracy-boot-cover', order: 0, label: 'Boot cover' },
      BootCover
    )
  )

  // 3. Chrome.
  ctx.effect(installTitle, 'tracy-brand: document title')
  ctx.effect(installFavicon, 'tracy-brand: favicon')
  ctx.effect(() => installStyles(CSS), 'tracy-brand: row styles')

  // 2. Palette: the layer is rebuilt whenever the brand values change. Boot values come from the
  // served page (host half, read live on every index render), so the palette is right even where
  // the settings mirror never loads.
  const values = createBrandValues((globalThis as Record<string, unknown>)[BOOT_GLOBAL])
  ctx.effect(() => {
    let dispose: (() => void) | undefined
    const applyLayer = (): void => {
      const value = values.get()
      dispose = ctx.theme.overrideTokens(
        SOURCE,
        composeLayer(PALETTE, value[PRIMARY_FIELD], value[GLOBAL_FONT_FIELD], value[CODE_FONT_FIELD])
      )
      syncFontLinks(fontStylesheets(value[GLOBAL_FONT_FIELD], value[CODE_FONT_FIELD]))
    }
    applyLayer()
    const off = values.subscribe(applyLayer)
    return () => {
      off()
      dispose?.()
      syncFontLinks([])
    }
  }, 'tracy-brand: theme layer')

  // Between dsh's Font size (11) and Conversation display (12): the three rows read as one
  // appearance group instead of scattering around dsh's own rows.
  // dsh's font-size stepper (ui-theme, list id `font-size`, priority 0) is shadowed by Tracy's
  // compact stepper at priority -1 — lowest renders. Same service, same bounds as ui-theme's schema (12–17).
  const themeFace: ThemeFace = {
    getFontSize: () => ctx.theme.getTheme().fontSize,
    setFontSize: (px) => ctx.theme.setFontSize(px),
    subscribe: (listener) => ctx.on('theme/change', listener),
    min: 12,
    max: 17
  }
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register(
      {
        name: 'settings.general.item',
        id: 'font-size',
        order: 11,
        priority: -1,
        locale: NS,
        inject: () => ({ theme: themeFace })
      },
      FontSizeRow
    )
  )

  // dsh's Appearance row (ui-theme, list id `appearance`, order 10, priority 0) is shadowed the
  // same way by three window thumbnails (Akemi, 02/10/2026). Same service, same stored preference.
  const appearanceFace: AppearanceFace = {
    getPreference: () => ctx.theme.getTheme().preference,
    setTheme: (id) => ctx.theme.setTheme(id),
    subscribe: (listener) => ctx.on('theme/change', listener)
  }
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register(
      {
        name: 'settings.general.item',
        id: 'appearance',
        order: 10,
        priority: -1,
        locale: NS,
        inject: () => ({ theme: appearanceFace })
      },
      AppearanceRow
    )
  )

  // 4. Preferences, only where dsh's settings forms exist. The form follows edits made anywhere
  // (these rows, the profile file, another tab) and the palette follows the form.
  ctx.inject(['configForms'], (forms) => {
    const scope = forms.configForms.get(SETTINGS_NS)
    forms.effect(() => {
      values.adopt(scope.getSnapshot().value)
      return scope.subscribe(() => values.adopt(scope.getSnapshot().value))
    }, 'tracy-brand: settings form adoption')

    const rows: readonly [string, number, unknown][] = [
      ['tracy-primary-color', 11.1, PrimaryColorRow],
      ['tracy-font-global', 11.2, GlobalFontRow],
      ['tracy-font-code', 11.3, CodeFontRow]
    ]
    // Registered only while dsh serves this entry's form: a page in `memory` mode (off loopback)
    // shows no rows at all instead of three permanently disabled ones.
    forms.effect(
      () =>
        forms.configForms.whileServed([SETTINGS_NS], () => {
          const offs = rows.map(([id, order, component]) =>
            forms.slots.inject('settings.general.item', () =>
              forms.slots.register(
                { name: 'settings.general.item', id, order, locale: NS, inject: () => ({ scope }) },
                component
              )
            )
          )
          return () => {
            for (const off of offs) off()
          }
        }),
      'tracy-brand: settings rows'
    )
  })
}
