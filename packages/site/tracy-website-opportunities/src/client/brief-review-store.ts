/**
 * The owner's "reviewed" marks of the Site content brief checklist (#537, option E), kept in this browser only: no
 * server door holds them. One storage key per opportunity and brief revision (`briefReviewKey`), so a reload keeps
 * the marks and a new revision starts with none. Storage may be missing or throw (a private window, blocked site
 * data): every read and write is guarded, and the marks then live for this page only.
 */
import { useCallback, useEffect, useState } from 'react'

import { type ReviewMarks, briefReviewKey, parseMarks } from './brief-steps-model.ts'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function readMarks(key: string | null): ReviewMarks {
  if (key === null) return {}
  try {
    return parseMarks(storage()?.getItem(key) ?? null)
  } catch {
    return {}
  }
}

function writeMarks(key: string, marks: ReviewMarks): void {
  try {
    storage()?.setItem(key, JSON.stringify(marks))
  } catch {
    // Storage refused: the marks still hold for this page.
  }
}

export interface BriefReviewStore {
  marks: ReviewMarks
  /** Replaces the marks and stores them. */
  save: (marks: ReviewMarks) => void
}

/** The marks of one brief revision; no revision yet → no marks, and saving keeps them in memory only. */
export function useBriefReviewMarks(opportunityId: string, revisionId: string | null): BriefReviewStore {
  const key = revisionId === null ? null : briefReviewKey(opportunityId, revisionId)
  const [state, setState] = useState<{ key: string | null; marks: ReviewMarks }>(() => ({
    key,
    marks: readMarks(key)
  }))
  useEffect(() => {
    if (state.key !== key) setState({ key, marks: readMarks(key) })
  }, [key, state.key])
  const save = useCallback(
    (marks: ReviewMarks): void => {
      setState({ key, marks })
      if (key !== null) writeMarks(key, marks)
    },
    [key]
  )
  return { marks: state.key === key ? state.marks : readMarks(key), save }
}
