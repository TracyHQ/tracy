// The address a Joomla page is asked at for template quality (ticket #586, review round 2). The host reads a page path
// under `/index.php` unless it already starts with `/index.php` followed by `/` or its end (`underIndex` of
// `apps/tracy-web/src/site-check/host-measure.js`, `planPath` of `apps/tracy-host/src/demo-qa.js`), so an address the
// write gives as `index.php?Itemid=245` was read at `/index.php/index.php?Itemid=245`. Asked as `/index.php/?...` it is
// read as it is, and Joomla answers it as the same page. Pure.

/** The address of a page path that the host reads unchanged. */
export function joomlaQualityPath(p) {
  const path = '/' + String(p ?? '').replace(/^\/+/, '')
  return path.replace(/^\/index\.php\?/, '/index.php/?').replace(/^\/\?/, '/index.php/?')
}
