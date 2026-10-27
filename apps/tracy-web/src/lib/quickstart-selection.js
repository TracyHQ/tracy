/** Archive identity excludes the independently managed Cowork extension. */
export function quickstartReleaseIdentity(entry) {
  if (!entry?.version) return null
  const files = Object.fromEntries(
    Object.entries(entry.install ?? entry)
      .filter(
        ([part, file]) =>
          part !== 'cowork' && typeof file?.file === 'string' && typeof file?.sha256 === 'string'
      )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([part, file]) => [part, { file: file.file, sha256: file.sha256 }])
  )
  return { version: entry.version, files }
}

export function quickstartReleaseMatches(expected, actual) {
  if (
    !expected ||
    !actual ||
    typeof expected.version !== 'string' ||
    !expected.version ||
    expected.version !== actual.version ||
    !expected.files ||
    !actual.files
  )
    return false
  const keys = Object.keys(expected.files).sort()
  return (
    keys.length > 0 &&
    keys.join('\0') === Object.keys(actual.files).sort().join('\0') &&
    keys.every(
      (part) =>
        expected.files[part]?.file === actual.files[part]?.file &&
        /^[a-f0-9]{64}$/.test(expected.files[part]?.sha256 ?? '') &&
        expected.files[part].sha256 === actual.files[part]?.sha256
    )
  )
}

/** Historical actions have no selection; new actions must keep their frozen revision identity. */
export function demoSelectionMatchesRevision(selection, revision) {
  return (
    !selection ||
    (selection.cms === revision?.cms &&
      selection.design === revision?.template?.design &&
      selection.quickstart === revision.template.quickstart &&
      selection.version === revision.template.version &&
      (!selection.release || quickstartReleaseMatches(selection.release, revision.template.release)))
  )
}
