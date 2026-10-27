import './tokens.css'

export { cn } from './lib/cn'
export { useIsMobile } from './hooks/use-mobile'

// ── shadcn `base-nova` registry, complete ──────────────────────────────────────────────────
//
// Every component below is the registry file with four mechanical rewrites: the `@/registry/...`
// aliases become relative paths, and `<IconPlaceholder lucide="X" …/>` becomes `<X …/>` from
// lucide-react. `IconPlaceholder` is the shadcn.com site's own component, not part of the
// registry — it exists so that page can swap icon sets for the reader. We pick lucide once,
// here, because this package already depends on it.
//
// 🔒 THE PRIMITIVE IS `@base-ui/react`, NOT RADIX. `vendor/shadcn-admin` is the classic radix
// generation, so its `components/ui/*.tsx` CANNOT be copied in beside these — two primitive
// libraries in one library both render, so no gate would go red. When a component is missing,
// fetch it from `https://ui.shadcn.com/r/styles/base-nova/<name>.json`.
export * from './components/ui/accordion'
export * from './components/ui/alert'
export * from './components/ui/alert-dialog'
export * from './components/ui/aspect-ratio'
export * from './components/ui/attachment'
export * from './components/ui/avatar'
export * from './components/ui/badge'
export * from './components/ui/breadcrumb'
export * from './components/ui/bubble'
export * from './components/ui/button'
export * from './components/ui/button-group'
export * from './components/ui/calendar'
export * from './components/ui/card'
export * from './components/ui/carousel'
export * from './components/ui/chart'
export * from './components/ui/checkbox'
export * from './components/ui/collapsible'
export * from './components/ui/combobox'
export * from './components/ui/command'
export * from './components/ui/context-menu'
export * from './components/ui/dialog'
export * from './components/ui/direction'
export * from './components/ui/drawer'
export * from './components/ui/dropdown-menu'
export * from './components/ui/empty'
// `field` is what base-nova calls `form`: the registry's `form` entry is an empty stub, because
// `@base-ui/react` ships `form` and `field` primitives and the react-hook-form wrapper went away.
export * from './components/ui/field'
export * from './components/ui/hover-card'
export * from './components/ui/input'
export * from './components/ui/input-group'
export * from './components/ui/input-otp'
export * from './components/ui/item'
export * from './components/ui/kbd'
export * from './components/ui/label'
export * from './components/ui/marker'
export * from './components/ui/menubar'
export * from './components/ui/message'
export * from './components/ui/message-scroller'
export * from './components/ui/native-select'
export * from './components/ui/navigation-menu'
export * from './components/ui/pagination'
export * from './components/ui/popover'
export * from './components/ui/progress'
export * from './components/ui/questionnaire'
export * from './components/ui/radio-group'
export * from './components/ui/resizable'
export * from './components/ui/scroll-area'
export * from './components/ui/select'
export * from './components/ui/separator'
export * from './components/ui/sheet'
export * from './components/ui/sidebar'
export * from './components/ui/skeleton'
export * from './components/ui/slider'
export * from './components/ui/spinner'
export * from './components/ui/switch'
export * from './components/ui/table'
export * from './components/ui/tabs'
export * from './components/ui/textarea'
export * from './components/ui/toggle'
export * from './components/ui/toggle-group'
export * from './components/ui/tooltip'

// 🔒 TWO TOASTERS EXIST, AND ONLY ONE MAY KEEP THE PLAIN NAME.
//
// `sonner.tsx` and `toast.tsx` both export `Toaster`, so a bare `export *` from both would make
// the second one silently win. They are not interchangeable: `sonner` is the app-level stack
// that `vendor/shadcn-admin` uses and it renders its own portal on `document.body`; `toast` is
// the `@base-ui/react` primitive, which needs a `ToastProvider` above it and stays inside the
// tree. Sonner keeps `Toaster` because that is the name every shadcn snippet on the internet
// reaches for; the primitive's viewport is re-exported as `ToastToaster`.
//
// ⚠ `sonner` mounts a portal on `document.body`, so it belongs to MODE A only — the design
// bench, Storybook, and Worker-rendered pages. A dsh plugin lives inside the host's page and
// must not open a second portal there. See `DESIGN.md` §0.
export { Toaster } from './components/ui/sonner'
export {
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  Toaster as ToastToaster,
  createToastManager,
  toast,
  useToastManager
} from './components/ui/toast'

// ── Tracy's own, not from any registry ────────────────────────────────────────────────────
export { PlatformGlyph, type Platform } from './components/platform-glyph'
export {
  PreviewHeader,
  PreviewHeaderAction,
  PreviewPager,
  type PreviewHeaderProps,
  type PreviewPagerProps
} from './components/preview-header'
export { SettingsPage, SettingsRow, SettingsSection } from './components/settings'
export {
  TAB_LOADING_DELAY_MS,
  TAB_LOADING_FADE_MS,
  TAB_LOADING_MIN_SHOWN_MS,
  TabLoadingBar,
  TabLoadingScope,
  type TabLoadingPhase,
  useDelayedLoading,
  useTabLoading
} from './components/tab-loading-bar'
export { TracyMark, TracyWordmark, TracyName, TRACY_MARK_COLOR, TRACY_MARK_PATH } from './brand'
