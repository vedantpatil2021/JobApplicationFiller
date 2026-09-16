/**
 * Labels phrased as a yes/no question — "Are you...", "Do you...", etc.
 * Anchored to the start (past optional leading quote/whitespace): "Why do
 * you want to work here?" contains "do you" too, but is a WH-question, not
 * a yes/no one — matching anywhere in the sentence flagged that as
 * implausible and broke it (M4.7 regression, caught by this file's own
 * "does not flag a label that is not phrased as yes/no" test).
 */
const YES_NO_LABEL =
  /^\s*["'"]?\s*(are you|do you|does (he|she|it|the)|is (he|she|it|this|that|your)|was (he|she|it)|were you|have you|has (he|she|it)|did you|will you|would you|can you|could you)\b/i

/** Answers that plausibly respond to a yes/no question. */
const YES_NO_VALUE =
  /^(yes|no|y|n|true|false|decline to (answer|self[- ]identify)|prefer not to (answer|say)|n\/a|not applicable|not specified)\b/i

/**
 * A label phrased as a yes/no question that's about to receive a value that
 * doesn't read as yes/no is almost certainly a mismatch, not a real answer —
 * whatever produced the value (a resolver mismatch, an AI misread, or a
 * harvesting label mixup) got the wrong field or the wrong value. Better to
 * leave it for manual review than write something that reads as nonsense on
 * the real page. Live-test finding (M4.7): this exact gap filled "Are you
 * Hispanic or Latino?" with a city name.
 */
export function isImplausibleYesNoAnswer(label: string, value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return YES_NO_LABEL.test(label) && !YES_NO_VALUE.test(trimmed)
}

/** An ISO date value (YYYY-MM-DD), the shape every date field in this app writes. */
const ISO_DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/

/** Labels that plausibly ask for a date, so an ISO-shaped value is expected. */
const DATE_LABEL_HINT = /\b(date|when|start|available|availability|deadline|birth|dob)\b/i

/**
 * An ISO-date-shaped value going into a field whose label has nothing to do
 * with dates is almost certainly a mismatch. Live-test finding (M4.8): a
 * "Location (City)" field got e_signature.date's value verbatim — confirmed
 * against the actual profile.yaml, which held the exact same date string.
 * The precise mechanism (resolver mismatch, a misclassified control, or a
 * harvesting label mixup) wasn't found without live DOM, but whatever
 * produced it, a date has no business in a city field — refuse it the same
 * way isImplausibleYesNoAnswer refuses a place name in a yes/no field.
 */
export function isImplausibleDateAnswer(label: string, value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return ISO_DATE_VALUE.test(trimmed) && !DATE_LABEL_HINT.test(label)
}
