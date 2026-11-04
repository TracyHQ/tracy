// The last report's view for a first write: nothing is on the site yet (last-report.js reads a real one).
export const NO_LAST = {
  active: false,
  report: null,
  line: () => null,
  same: () => false,
  sameKey: () => false,
  hidden: () => false,
  allDone: () => null,
  held: () => []
}
