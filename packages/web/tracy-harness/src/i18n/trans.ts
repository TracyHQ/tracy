/**
 * A dictionary value with inline markup: `<Trans i18nKey="x.y" values={{ n }} components={{ b:
 * <strong />, a: <a href="…" /> }} />` for `"Read <a>the guide</a> about <b>{n}</b>"`. A tag with
 * no component renders its children as plain text.
 */
import { cloneElement, createElement, Fragment, type ReactElement, type ReactNode } from 'react'

import { type MarkupNode, parseMarkup } from './markup.ts'
import { useT } from './react.ts'
import type { Params } from './translator.ts'

type Components = Readonly<Record<string, ReactElement>>

function render(nodes: readonly MarkupNode[], components: Components): ReactNode[] {
  return nodes.map((node, i) => {
    if (typeof node === 'string') return node
    const children = render(node.children, components)
    const component = Object.hasOwn(components, node.tag) ? components[node.tag] : undefined
    if (!component) return createElement(Fragment, { key: i }, ...children)
    return cloneElement(component, { key: i }, ...(children.length > 0 ? children : []))
  })
}

export function Trans({
  i18nKey,
  values,
  components = {}
}: {
  i18nKey: string
  values?: Params
  components?: Components
}) {
  const t = useT()
  // Only `count` is filled here (it picks the plural form); other values fill text nodes below.
  const count = typeof values?.count === 'number' ? values.count : undefined
  const template = t(i18nKey, count === undefined ? undefined : { count })
  return createElement(Fragment, null, ...render(parseMarkup(template, values), components))
}
