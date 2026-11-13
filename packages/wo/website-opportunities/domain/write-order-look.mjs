// What the write order reads from the look and from the template's mapping file (ticket #597, Contract A #584). Pure.
//
//   look.logo              a text logo (`kind: 'text'`) shows the business name: the order fills `text` with it.
//   networkIconClasses     optional `{classes: {<network>: "<class>"}, why}`: a class-name network icon takes its
//                          network's class (`className`); a network the table lacks has no mark in the template, so its
//                          icon is hidden (`social_icon_not_in_template`) and its link with it. No table: unchanged.
//   library                optional `{position, pageTypes: {<page type>: <position>}}`: a library block's position
//                          is resolved for its page (`position.resolved`), next to its request.
// Every other mapping key is carried to the order untouched (`template.mapping`), for the write step to read.
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The order's look, with the business name as the text of a text logo. */
export function lookOf(look, plan, facts) {
  const base = look ?? {
    accent: plan?.look?.accent ?? null,
    accentFrom: null,
    logo: plan?.look?.logo ?? null
  }
  const logo = base.logo
  if (!isObject(logo) || logo.kind !== 'text' || isText(logo.text)) return base
  const name = facts.find((f) => f.kind === 'business.name' && isText(f.value))?.value
  return name ? { ...base, logo: { ...logo, text: name } } : base
}

/**
 * The icons with the template's network classes applied (a copy of each icon it changes).
 * @param {object[]} icons the icon entries of the icon step
 * @param {object} [mapping] the template's mapping file
 */
export function classedIcons(icons, mapping) {
  const classes = mapping?.networkIconClasses?.classes
  if (!isObject(classes)) return icons
  return icons.map((icon) => {
    if (icon.storage !== 'class-name' || icon.source !== 'network' || !isText(icon.network)) return icon
    const className = classes[icon.network]
    if (isText(className)) return { ...icon, className }
    return { ...icon, source: 'none', reason: 'social_icon_not_in_template' }
  })
}

/** The position a library block takes on a page of `pageType`, or undefined when the mapping gives none. */
export function libraryPositionOf(mapping, pageType) {
  const library = mapping?.library
  if (!isObject(library)) return undefined
  const byType = isObject(library.pageTypes) ? library.pageTypes[pageType] : undefined
  if (isText(byType)) return byType
  return isText(library.position) ? library.position : undefined
}
