// The content map key of a kit id, shared by the site writer and the picture bench.
/** Kit id to content map key: `block-163.4` -> `module-163.4`. Article and menu item ids stay as they are. */
export const contentMapKey = (id) => String(id ?? '').replace(/^block-/, 'module-')
