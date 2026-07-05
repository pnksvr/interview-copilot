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

// Procedural check-ins and acknowledgements that are shaped like questions but
// carry no interview content. Answering these would wipe the real answer, so we
// ignore them and keep the previous question's answer on screen.
const FILLER = [
  'are you there',
  'you there',
  'still there',
  'can you hear me',
  'can you hear',
  'am i audible',
  'is my audio',
  'can you see my screen',
  'can you start',
  'can you start explaining',
  'can you begin',
  'can we start',
  'can we begin',
  'shall we start',
  'shall we begin',
  'are you ready',
  'ready to start',
  'please start',
  'please begin',
  'please continue',
  'please proceed',
  'go ahead',
  'carry on',
  'hello',
  'hi',
  'yes',
  'no',
  'okay',
  'ok',
  'right',
  'sure',
  'correct',
  'got it',
  'thanks',
  'thank you'
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

/** True for short procedural check-ins that should not trigger a new answer. */
function isFiller(sentence: string): boolean {
  const norm = sentence
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!norm) return true
  const words = norm.split(' ')
  if (words.length > 6) return false
  return FILLER.some((f) => norm === f || norm.startsWith(f + ' ') || norm.startsWith(f))
}

/**
 * Returns the most recent sentence in `text` that looks like a real interview
 * question, ignoring procedural filler, or null if none is found.
 */
export function detectQuestion(text: string): string | null {
  const found = sentences(text)
    .filter(looksLikeQuestion)
    .filter((s) => !isFiller(s))
  return found.length ? found[found.length - 1] : null
}
