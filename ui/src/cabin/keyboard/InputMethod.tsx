import { useText } from '../state/text'
import { PageGlyph } from './glyphs'
import { CANDIDATES_PER_PAGE, candidatesFor, syllablesShown } from './pinyin'
import { useKeyboard } from './store'
import './keyboard.css'

/**
 * The Chinese input method's bar (`store.ts`, `pinyin.ts`): what is being composed at its left, the candidates
 * it offers beside it — each numbered with the digit that picks it, the first lit as the one the space bar
 * takes — and the two paging keys at its right end.
 *
 * A sibling of the keyboard rather than its child, and drawn above its panel: the keyboard's glass filters its
 * whole subtree, which clips anything hanging outside its own box, so a bar inside it would never be seen
 * (`Shell.tsx` sets it beside the keyboard, `keyboard.css` puts it where the keyboard's top edge is).
 */
export function InputMethod() {
  const composing = useKeyboard((state) => state.composing)
  const table = useKeyboard((state) => state.table)
  const page = useKeyboard((state) => state.page)
  const text = useText()
  if (!composing) return null
  // The page's slice of what the composition offers, and how many pages there are (the paging keys' own end).
  const offered = table ? candidatesFor(composing, table) : []
  const pages = Math.max(1, Math.ceil(offered.length / CANDIDATES_PER_PAGE))
  const candidates = offered.slice(page * CANDIDATES_PER_PAGE, (page + 1) * CANDIDATES_PER_PAGE)

  return (
    <div className="keyboard-ime" role="group" aria-label={text.keyboard.ime}>
      <span className="keyboard-ime-pinyin">{table ? syllablesShown(composing, table) : composing}</span>
      {candidates.length > 0 && (
        <div className="keyboard-ime-candidates">
          {candidates.map((candidate, index) => (
            <button
              key={`${index}:${candidate}`}
              type="button"
              tabIndex={-1}
              className={index === 0 ? 'keyboard-ime-candidate first' : 'keyboard-ime-candidate'}
              onPointerUp={() => useKeyboard.getState().choose(page * CANDIDATES_PER_PAGE + index)}
            >
              <span className="keyboard-ime-digit" aria-hidden>
                {index + 1}
              </span>
              <span className="keyboard-ime-word">{candidate}</span>
            </button>
          ))}
        </div>
      )}
      <div className="keyboard-ime-pages">
        <button
          type="button"
          tabIndex={-1}
          className="keyboard-ime-page"
          aria-label={text.keyboard.imeBack}
          disabled={pages <= 1}
          onPointerUp={() => useKeyboard.getState().turnPage(-1)}
        >
          <PageGlyph back />
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="keyboard-ime-page"
          aria-label={text.keyboard.imeOn}
          disabled={pages <= 1}
          onPointerUp={() => useKeyboard.getState().turnPage(1)}
        >
          <PageGlyph />
        </button>
        {/* Two keys, not three: the put-away key that used to sit here (§27.5) took the width the ninth candidate
            needed, so the eighth was half under it. The bottom row's own hide key still puts the keyboard away. */}
      </div>
    </div>
  )
}
