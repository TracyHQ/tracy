import { writeMainMenu } from './main-menu.js'

/** Template-declared main and child menus; footer and legal menus remain the template's. */
export async function writeEmdashMainMenu({ api, seed, sitePlan, model, locale, signal }) {
  const menus = (seed.menus ?? []).filter(
    (m) => !/footer|legal/i.test(m.name) && (m.locale ?? seed.defaultLocale) === seed.defaultLocale
  )
  return writeMainMenu({
    sitePlan,
    model,
    locale,
    signal,
    read: async () => {
      const items = []
      for (const menu of menus) {
        const got = await api(
          'GET',
          `/_emdash/api/menus/${encodeURIComponent(menu.name)}?locale=${encodeURIComponent(menu.locale ?? seed.defaultLocale)}`
        )
        const visit = (rows, parent = '') => {
          for (const row of rows) {
            const path = row.url ?? row.customUrl
            if (path)
              items.push({
                key: `${menu.name}:${row.id}`,
                id: row.id,
                menu: menu.name,
                locale: menu.locale ?? seed.defaultLocale,
                parent,
                path,
                label: String(row.label ?? '')
              })
            visit(row.children ?? [], String(row.id))
          }
        }
        visit(got?.items ?? got?.menu?.items ?? got?.item?.items ?? [])
      }
      return items
    },
    write: async (items) => {
      for (const item of items)
        await api(
          'PUT',
          `/_emdash/api/menus/${encodeURIComponent(item.menu)}/items/${encodeURIComponent(item.id)}?locale=${encodeURIComponent(item.locale)}`,
          { label: item.label }
        )
    }
  })
}
