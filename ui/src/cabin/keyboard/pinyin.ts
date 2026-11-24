/**
 * The cabin's own Chinese input method: the player types pinyin and picks from the candidates.
 *
 * WestPlay's keyboard is the only one the cab has: the game takes the player's own keys away while they type
 * (the plugin, `crates/plugin/src/typing.rs`), so the PC's own IME — which composes in a window of its own on
 * the desktop — never sees them. Instead the letters are composed here, in the cabin's keyboard: what is typed
 * shows in a bar above the keys, the candidates for it beside them, and a pick writes the character (or the
 * word) into the field as one piece of text.
 *
 * The table is generated, not written: `tools/chinese/build_pinyin_table.py` builds it from pinyin-data,
 * rime-essay, OpenCC's character dictionary and phrase-pinyin-data (see that script), and it is fetched here
 * the first time Chinese is typed, so a player who never does pays nothing for it.
 */

/** The table: characters by their syllable (`"ni": "你呢尼…"`, the most used first), words by their pinyin
 * (`"nihao": ["你好", …]`). */
export interface Table {
  chars: Record<string, string>
  words: Record<string, string[]>
}

/** Where the table is served from (`ui/public/chinese/pinyin.json`). */
export const TABLE_URL = '/chinese/pinyin.json'

/** How many candidates the bar shows at once: nine, what the digits 1 to 9 pick from, a page at a time (the
 * digits the keyboard has; a phone's bar numbers them the same). The two paging keys at the bar's right end
 * take the rest (`Keyboard.tsx`), so every candidate a syllable has is reachable. */
export const CANDIDATES_PER_PAGE = 9

/** The most letters composed at once (a long word's pinyin; past it the composition stops taking more). */
export const MOST_COMPOSED = 32

/** The most letters one syllable has (zhuang, chuang). */
const MOST_SYLLABLE = 6

let fetched: Promise<Table> | null = null

/** The table, fetched once. A failure is kept as a failure: the keyboard then commits what was typed as it
 * stands, rather than offering candidates it doesn't have. */
export function loadTable(): Promise<Table> {
  fetched ??= fetch(TABLE_URL).then((answer) => {
    if (!answer.ok) throw new Error(`${TABLE_URL}: ${answer.status}`)
    return answer.json() as Promise<Table>
  })
  return fetched
}

/** The pinyin letters a key is, or `null`: what the composition takes (`'` splits syllables, as in `xi'an`). */
export function pinyinKey(char: string): string | null {
  const lower = char.toLowerCase()
  return /^[a-z']$/.test(lower) ? lower : null
}

/** The candidate a digit picks: 1 is the first; 0 and the rest none (`null`). */
export function digitChoice(char: string): number | null {
  return /^[1-9]$/.test(char) ? Number(char) - 1 : null
}

/** The syllables in the buffer that are complete, and the letters left over that aren't one yet: `"nihao"` is
 * `["ni", "hao"]`, and `"nih"` is `["ni"]` with `"h"` left for the player to finish.
 *
 * Greedy, longest first, so `"xian"` is 先's syllable rather than 西's and 安's; a player wanting 西安 types
 * `xi'an`, whose `'` is a syllable boundary of its own (and is not written into the field). */
export function syllablesIn(buffer: string, table: Table): { done: string[]; rest: string } {
  const done: string[] = []
  let rest = ''
  for (const part of buffer.split("'")) {
    let at = 0
    while (at < part.length) {
      let taken = 0
      for (let length = Math.min(MOST_SYLLABLE, part.length - at); length >= 1; length--) {
        if (part.slice(at, at + length) in table.chars) {
          taken = length
          break
        }
      }
      if (taken === 0) break
      done.push(part.slice(at, at + taken))
      at += taken
    }
    rest = part.slice(at)
    // An unfinished syllable ends the run: the letters after it can't be read yet either.
    if (rest) break
  }
  return { done, rest }
}

/** What the buffer spells, syllable by syllable, for the bar above the keys: `"nihao"` is `"ni hao"`. */
export function syllablesShown(buffer: string, table: Table): string {
  if (!buffer) return ''
  const { done, rest } = syllablesIn(buffer, table)
  return [...done, rest].filter(Boolean).join(' ')
}

/** A word's own key: the buffer's letters, without the syllable boundaries the player typed (`xi'an` is the
 * table's `xian`, the word 西安's pinyin). */
function wordKey(buffer: string): string {
  return buffer.replace(/'/g, '')
}

/** What the buffer offers, best first.
 *
 * A word whose pinyin is the whole buffer (你好 for `"nihao"`) is offered first — but only once the buffer
 * reads as more than one syllable: `"xian"` is 先's syllable at least as often as it is 西安's pinyin, so its
 * characters come first there (`xi'an` is how 西安 is asked for). The characters of the *first* syllable come
 * next either way: picking one leaves the rest of the buffer to type on. */
export function candidatesFor(buffer: string, table: Table): string[] {
  if (!buffer) return []
  const words = table.words[wordKey(buffer)] ?? []
  const { done } = syllablesIn(buffer, table)
  const first = done[0]
  const characters = first ? Array.from(table.chars[first] ?? '') : []
  const offered = done.length >= 2 ? [...words, ...characters] : [...characters, ...words]
  return offered
}

/** What picking the candidate at `index` writes into the field, and the buffer left to type on: the word
 * whole (its pinyin is the whole buffer), or the first syllable's character (`"nihao"` picks 你, leaving
 * `"hao"`). `null` when there is no such candidate. */
export function pick(buffer: string, index: number, table: Table): { text: string; buffer: string } | null {
  if (index < 0) return null
  const words = table.words[wordKey(buffer)] ?? []
  const { done } = syllablesIn(buffer, table)
  const first = done[0] ?? ''
  const characters = first ? Array.from(table.chars[first] ?? '') : []
  const offered = done.length >= 2 ? [...words, ...characters] : [...characters, ...words]
  const chosen = offered[index]
  if (chosen === undefined) return null
  // A word's pinyin is the whole buffer, so it takes all of it; a character takes its syllable.
  const whole = index < words.length
  const left = whole ? '' : buffer.slice(first.length).replace(/^'+/, '')
  return { text: chosen, buffer: left }
}

/** What the buffer spells if it is committed as it stands (`"ni"` → `"ni"`): the way out when nothing offered
 * is what the player wanted, and how letters that aren't pinyin at all (`"abc"`) are typed. The syllable
 * boundaries the player typed are not written: they only said where one ends. */
export function rawText(buffer: string): string {
  return buffer.replace(/'/g, '')
}
