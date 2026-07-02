const QUESTION_STARTERS = [
  'what',
  'why',
  'how',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'whose',
  'can you',
  'could you',
  'would you',
  'will you',
  'do you',
  'did you',
  'have you',
  'are you',
  'is there',
  'tell me',
  'describe',
  'explain',
  'walk me',
  'give me an example',
  'what is',
  "what's"
]

/** Splits text into rough sentences. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function looksLikeQuestion(sentence: string): boolean {
  const lower = sentence.toLowerCase().trim()
  if (lower.endsWith('?')) return true
  return QUESTION_STARTERS.some((q) => lower.startsWith(q))
}

/**
 * Returns the most recent sentence in `text` that looks like an interview
 * question, or null if none is found.
 */
export function detectQuestion(text: string): string | null {
  const found = sentences(text).filter(looksLikeQuestion)
  return found.length ? found[found.length - 1] : null
}
