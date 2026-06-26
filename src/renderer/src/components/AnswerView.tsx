import { JSX } from 'react'

interface Props {
  text: string
  streaming: boolean
}

/**
 * Minimal renderer for the model's answer. Splits out fenced code blocks and
 * renders the rest as wrapped paragraphs. Avoids a heavyweight markdown
 * dependency while keeping code readable during an interview.
 */
export function AnswerView({ text, streaming }: Props): JSX.Element {
  const blocks: JSX.Element[] = []
  const parts = text.split(/```/)
  parts.forEach((part, i) => {
    const isCode = i % 2 === 1
    if (isCode) {
      const body = part.replace(/^[a-zA-Z0-9]*\n/, '')
      blocks.push(
        <pre key={i}>
          <code>{body}</code>
        </pre>
      )
    } else if (part.trim()) {
      part
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .forEach((para, j) => {
          blocks.push(<p key={`${i}-${j}`}>{para.trim()}</p>)
        })
    }
  })

  return (
    <div className="answer-body">
      {blocks}
      {streaming && <span className="cursor">&nbsp;</span>}
    </div>
  )
}
