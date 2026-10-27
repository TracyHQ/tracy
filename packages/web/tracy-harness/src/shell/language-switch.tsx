/**
 * The /ops interface language, beside the theme switch under the brand (plan D4, Lee 26/10/2026):
 * one globe button opening the eight languages, each written in its own language, a tick on the one
 * on screen, and "Follow device" to forget the pick. Where the pick lives: `i18n/ops-language.ts`.
 */
import { INTERFACE_LANGUAGES } from '@tracy/core/interface-languages'
import {
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@tracy/ui'
import { Globe } from 'lucide-react'

import { useLanguage, useT } from '../i18n'

const SHOWN = INTERFACE_LANGUAGES.filter((l) => l.shown)
const nameOf = (id: string) => SHOWN.find((l) => l.id === id)?.label ?? id

export function LanguageSwitch() {
  const t = useT()
  const language = useLanguage()
  const current = language.pending ?? language.lang
  const label = t('shell.language.current', { language: nameOf(current) })
  return (
    <div
      className="flex w-fit rounded-lg bg-sidebar-accent p-0.5 group-data-[collapsible=icon]:hidden"
      data-language-switch=""
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              title={label}
              aria-label={label}
              data-language-current={language.lang}
              data-language-failed={language.failed ?? undefined}
              className={cn(
                'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
                'hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring',
                'data-popup-open:bg-background data-popup-open:text-foreground'
              )}
            />
          }
        >
          <Globe className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuLabel>{t('shell.language.title')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current} onValueChange={(id) => language.setLanguage(String(id))}>
            {SHOWN.map((l) => (
              <DropdownMenuRadioItem
                key={l.id}
                value={l.id}
                lang={l.id}
                closeOnClick
                data-language-choice={l.id}
              >
                {l.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={language.followsDevice}
            closeOnClick
            onCheckedChange={() => language.setLanguage('device')}
            data-language-choice="device"
          >
            {t('shell.language.followDevice')}
          </DropdownMenuCheckboxItem>
          {language.failed ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-normal">
                {t('shell.language.failed', { language: nameOf(language.failed) })}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={language.retry} data-language-retry="">
                {t('shell.language.retry')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
