/**
 * Normalisation used by the citation gate.
 *
 * Both the quote check and the rubric-line check compare normalised strings.
 * They must use exactly this function: if the gate normalised differently from
 * the thing that produced the rubric, a valid grade could be rejected or, worse,
 * a paraphrase could slip through.
 *
 * What it deliberately does NOT do: stemming, synonym folding, or fuzzy
 * matching. A paraphrase is meant to fail. The evaluator is required to copy.
 */

/** Lowercase, collapse all whitespace runs, trim, and normalise quote marks. */
export function normalize(input: string | null | undefined): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is `quote` actually something the speaker said?
 *
 * Substring rather than equality, because the evaluator quotes a fragment of a
 * longer transcript. Empty quotes never ground: a blank string is a substring
 * of everything, which would let an unsupported miss through.
 */
export function isQuotedFrom(quote: string, transcript: string): boolean {
  const q = normalize(quote);
  if (!q) return false;
  return normalize(transcript).includes(q);
}

/** Is `line` one of the exact lines we put in the prompt? */
export function isSuppliedLine(line: string, supplied: readonly string[]): boolean {
  const target = normalize(line);
  if (!target) return false;
  return supplied.some((candidate) => normalize(candidate) === target);
}

/** Cheap word count, used for the "did they actually speak" check. */
export function wordCount(input: string): number {
  const n = normalize(input);
  return n ? n.split(" ").length : 0;
}
