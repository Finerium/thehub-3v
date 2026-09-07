// The window of the frozen coverage recipe (blueprint 9.5; harness/coverage.py `contain_doc` at lines 48-64, the
// verbatim port of the audit's recipe_check.py).
//
// Frozen rules, ported field by field: the window is twice the field's content-word count COUNTING DUPLICATES, it
// advances one token at a time, the score is the largest share of the field's DISTINCT content words held by one
// window, and a document no longer than the window is one window. A field with fewer than three content words is
// skipped (harness/coverage.py:78); it scores 0 here, which can never win the strict `c > best` of
// harness/coverage.py:92, so skipping and scoring 0 are the same thing and the rule lives in one place.
export const WINDOW_MULTIPLIER = 2;
export const MIN_CONTENT_WORDS = 3;

/** The largest share of the field's distinct content words inside one window, unrounded (the rounding is score.ts). */
export function fieldScore(fieldWords: readonly string[], lessonWords: readonly string[]): number {
  if (fieldWords.length < MIN_CONTENT_WORDS) return 0;
  const distinct = new Set(fieldWords);
  if (distinct.size === 0) return 0;

  const size = fieldWords.length * WINDOW_MULTIPLIER;
  // harness/coverage.py:54: a document no longer than the window is one window.
  if (lessonWords.length <= size) {
    const held = new Set(lessonWords);
    let found = 0;
    for (const word of distinct) if (held.has(word)) found += 1;
    return found / distinct.size;
  }

  // A count per word, so a word leaving the window only stops counting when its last occurrence leaves it.
  const window = new Map<string, number>();
  for (let i = 0; i < size; i += 1) window.set(lessonWords[i], (window.get(lessonWords[i]) ?? 0) + 1);
  let best = 0;
  for (const word of distinct) if (window.has(word)) best += 1;

  for (let i = size; i < lessonWords.length; i += 1) {
    const leaving = lessonWords[i - size];
    const entering = lessonWords[i];
    const left = (window.get(leaving) ?? 0) - 1;
    if (left === 0) window.delete(leaving);
    else window.set(leaving, left);
    window.set(entering, (window.get(entering) ?? 0) + 1);

    let held = 0;
    for (const word of distinct) if (window.has(word)) held += 1;
    if (held > best) best = held;
    if (best === distinct.size) break;
  }
  return best / distinct.size;
}
