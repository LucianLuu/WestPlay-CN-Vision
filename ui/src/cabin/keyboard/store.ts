import { create } from 'zustand'
import { isInHost, postToHost, type TypedEvent, type TypingState } from '../../shared/host'
import { initialKeyboard, type KeyboardState, press, withoutLastWord } from './editing'
import type { Key, Language, ReturnKind } from './layouts'
import {
  CANDIDATES_PER_PAGE,
  candidatesFor,
  digitChoice,
  loadTable,
  MOST_COMPOSED,
  pick,
  pinyinKey,
  rawText,
  type Table,
} from './pinyin'

/** The text field being typed into: how to read and change its text, and what its return key does. */
export interface Typing {
  id: string
  returnKind: ReturnKind
  read(): string
  write(text: string): void
  /** Adds `text` as the field's own would: where its caret is, through the browser itself, if the field takes
   * text that way. A web page's own field does (`Input.insertText`, webapp.ts): it is the way into a field the
   * page keeps to itself (Bilibili's own components). The cabin's own fields leave this out and take the whole
   * text through `write`. */
  insert?(text: string): void
  submit(): void
  /** Whether the player's own keyboard types into it through here (`false`: the field itself takes those keys,
   * as a web page's own field does, and only their key lights up here). */
  playerTypes?: boolean
}

interface KeyboardStore {
  /** The field the keyboard types into, `null` when the keyboard is away. */
  field: Typing | null
  /** That field's selection: a number that changes with every selection (0: none), so the player's own
   * keyboard types only into a field selected while the truck stood still (the game plugin decides). */
  selection: number
  keys: KeyboardState
  /** The language the player switched the keyboard to (the globe key), for the rest of the session. */
  chosen: Language | null
  /** Whether the player's own keyboard types into the field (the host says). */
  physical: TypingState
  /** The last character typed on the player's own keyboard, for its key to light up (a new `id` each). */
  flash: { char: string; id: number } | null
  /** What the Chinese input method has composed so far: the pinyin typed, shown in a bar above the keys
   * until a candidate is picked (`''`: nothing, and the letters go into the field as usual). */
  composing: string
  /** The pinyin table the candidates come from, `null` until it has been fetched (the first time Chinese is
   * typed: a player who never types it never loads it). */
  table: Table | null
  /** Which page of candidates the bar is on (0-based): the two paging keys take it on, and the digits pick
   * from the page shown. Reset to the first whenever what is being composed changes. */
  page: number
  /** The next (`+1`) or previous (`-1`) page of candidates, round the ends. */
  turnPage(by: number): void
  /** Starts typing into `field` (selecting it): the keyboard comes up, in `language` (the game's own keyboard)
   * unless the player switched it. */
  attach(field: Typing, language: Language): void
  /** Stops typing into the field `id`, if the keyboard types into it: the keyboard goes away. */
  detach(id: string): void
  /** A key of the keyboard, pressed at `at` (ms). */
  press(key: Key, at?: number): void
  /** What the player typed on their own keyboard. */
  typed(event: TypedEvent): void
  /** A candidate picked (a tap in the bar, or one of the digits): writes it into the field, and keeps
   * composing whatever the buffer has left. */
  choose(index: number): void
}

let selections = 0
// The fetch of the pinyin table, once (null: not started; a rejection leaves it null to try again).
let fetching: Promise<unknown> | null = null

/** Says something worth seeing in the host's log (the page's own console isn't in it). The startup channel
 * carries it, and the host keeps one line of each, so a mark is cheap wherever it is said. */
function mark(stage: string) {
  if (typeof window !== 'undefined' && isInHost()) postToHost({ type: 'startup', stage })
}

export const useKeyboard = create<KeyboardStore>()((set, get) => {
  // Whether the host was last told the cabin's own input method takes the player's keys for the page's field
  // (null: never told). While it does, the host keeps them out of the page itself: the page's own field would
  // take the letters the composition is reading. Nothing but a web page's field is affected.
  let toldHost: boolean | null = null

  const tellHost = () => {
    const { field, keys } = get()
    // 车机自己的输入框（Apple Music、网易云、QQ、电台、车辆…）不带 `playerTypes`，
    // 那是「玩家的键盘自己往里打」才有的标记；只有它明确是 `true` 时才不用输入法。
    // 只认 `=== false` 的话，中文输入法在这些框里永远不会出现（owner 2026-11-23）。
    const ime = keys.language === 'zh' && field != null && field.playerTypes !== true
    if (ime !== toldHost) {
      toldHost = ime
      // Nothing to tell outside the host (a browser preview, the demo, a test).
      if (typeof window !== 'undefined' && isInHost()) postToHost({ type: 'ime', on: ime })
    }
  }

  /** The table, fetched the first time Chinese is typed: until it's here the bar shows the letters alone, and
   * what is composed is written as it stands when a candidate is asked for. */
  const fetchTable = () => {
    if (get().table || fetching) return
    fetching = loadTable()
      .then((table) => {
        set({ table })
        const syllables = Object.keys(table.chars).length
        const words = Object.values(table.words).reduce((all, one) => all + one.length, 0)
        mark(`Chinese input method: its table is here (${syllables} syllables, ${words} words)`)
      })
      .catch((error: unknown) => {
        // Tried again with the next letter typed: a fetch that failed once (a reload mid-way) may not again.
        fetching = null
        mark(`Chinese input method: its table could not be read (${String(error)})`)
      })
  }

  /** Which language the cabin's keyboard is typing in: what the player's own keys become depends on it, and a
   * player who says "it still types English" is really saying this is `en`. */
  const markLanguage = () => mark(`keyboard language ${get().keys.language}`)

  const compose = (buffer: string) => {
    fetchTable()
    // What is offered starts again from the first page: the buffer changed under it.
    set({ composing: buffer.slice(0, MOST_COMPOSED), page: 0 })
  }

  const flashLast = (text: string) => {
    const { flash } = get()
    if (text) set({ flash: { char: text.slice(-1), id: (flash?.id ?? 0) + 1 } })
  }

  /** Writes `text` into the field whole (the cabin's own fields take it that way). */
  const write = (text: string) => get().field?.write(text)

  /**
   * Adds `text` to the field the way the field's own would: where its caret is, through the browser itself,
   * when it takes text that way (a web page's field: `Input.insertText`, webapp.ts — the way into a field the
   * page keeps to itself, Bilibili's own components among them), else where the field's text ends.
   */
  const insert = (text: string) => {
    const { field } = get()
    if (!field) return
    if (field.insert) field.insert(text)
    else write(field.read() + text)
  }

  /** The composition written as the letters it stands for: the way out when nothing offered is what the
   * player wanted (`"abc"` types as it is), and what leaves it for another language or field. */
  const commitRaw = () => {
    const { composing } = get()
    set({ composing: '', page: 0 })
    if (composing) insert(rawText(composing))
  }

  /** What the composition offers, whole: empty until the table is here (or if it never came). */
  const offered = () => {
    const { composing, table } = get()
    return composing && table ? candidatesFor(composing, table) : []
  }

  const choose = (index: number) => {
    const { composing, table, field } = get()
    if (!composing || !field) return
    // Nothing fetched yet (or it failed): the letters are written as they stand, as an IME's does when it has
    // no candidate to offer.
    if (!table) {
      commitRaw()
      return
    }
    const picked = pick(composing, index, table)
    if (!picked) return
    insert(picked.text)
    // What is left to compose offers its own candidates: from the first page again.
    set({ composing: picked.buffer, page: 0 })
  }

  /** A key of the cabin's keyboard while the language is Chinese: the letters compose pinyin, space picks the
   * first candidate, a digit picks its own, delete takes a letter back. `false` for a key it leaves to the
   * plain path (the layer keys, shift, the field's own delete and return). */
  const imePress = (key: Key): boolean => {
    switch (key.kind) {
      case 'char': {
        const char = key.char.toLowerCase()
        const digit = digitChoice(char)
        if (digit !== null && get().composing) {
          // The digit picks from the page the bar is showing: 1 is the first candidate on it. A page holds
          // nine, so the last digit is the ninth candidate's, never the next page's first.
          if (digit < CANDIDATES_PER_PAGE) choose(get().page * CANDIDATES_PER_PAGE + digit)
          return true
        }
        const letter = pinyinKey(char)
        if (letter) {
          compose(get().composing + letter)
          return true
        }
        // A symbol, or a digit with nothing composed: the composition goes in first, then the character.
        commitRaw()
        insert(char)
        return true
      }
      case 'space':
        if (get().composing) {
          // The first candidate of the page shown, as iOS's space bar takes the one highlighted.
          choose(get().page * CANDIDATES_PER_PAGE)
          return true
        }
        insert(' ')
        return true
      case 'delete':
        if (get().composing) {
          set({ composing: get().composing.slice(0, -1), page: 0 })
          return true
        }
        return false
      case 'hide':
        // Put away mid-composition: the letters go with it (they were never the field's text).
        set({ composing: '', page: 0 })
        return false
      default:
        return false
    }
  }

  /** The plain path: what the keyboard always did (a character in, shift, another layer, the return key's
   * own meaning, putting the keyboard away). */
  const plainPress = (key: Key, at: number) => {
    // Another language: whatever was being composed is written as it stands, before the keyboard changes.
    if (key.kind === 'globe') commitRaw()
    const { field, keys } = get()
    if (!field) return
    const before = field.read()
    const outcome = press(keys, before, key, at)
    const away = outcome.hide || outcome.submit
    set({
      keys: outcome.state,
      chosen: key.kind === 'globe' ? outcome.state.language : get().chosen,
      field: away ? null : field,
      selection: away ? 0 : get().selection,
      ...(key.kind === 'globe' ? { composing: '', page: 0 } : {}),
    })
    if (outcome.text !== before) field.write(outcome.text)
    if (outcome.submit) field.submit()
    if (key.kind === 'globe') markLanguage()
  }

  return {
    field: null,
    selection: 0,
    keys: initialKeyboard('en'),
    chosen: null,
    physical: 'off',
    flash: null,
    composing: '',
    table: null,
    page: 0,
    turnPage: (by) => {
      const pages = Math.max(1, Math.ceil(offered().length / CANDIDATES_PER_PAGE))
      // Round the ends, as iOS's candidate pages do: pressing on past the last comes back to the first.
      set({ page: (((get().page + by) % pages) + pages) % pages })
    },
    attach: (field, language) => {
      const { field: current, chosen } = get()
      // A newly selected field starts on the letters, in the player's language (or the one they switched to);
      // one selected again keeps the keyboard as it was. Either way it's a new selection, which the player's
      // own keyboard may type into.
      const selection = ++selections
      const start = chosen ?? language
      if (current?.id === field.id) set({ field, selection })
      else set({ field, selection, keys: initialKeyboard(start, language), composing: '', page: 0 })
      tellHost()
      // Which language this field's keyboard came up in: Chinese is the input method's (pinyin.ts), anything
      // else types letters, so this line is what says whether the input method is the one in play.
      markLanguage()
    },
    detach: (id) => {
      if (get().field?.id === id) {
        // The keyboard goes with what was being composed: the letters were never the field's.
        set({ field: null, selection: 0, composing: '', page: 0 })
        tellHost()
      }
    },
    press: (key, at = performance.now()) => {
      const { field, keys } = get()
      if (!field) return
      if (keys.language === 'zh' && imePress(key)) {
        tellHost()
        return
      }
      plainPress(key, at)
      tellHost()
    },
    typed: (event) => {
      const { field, keys } = get()
      if (!field) return
      const chinese = keys.language === 'zh'
      // A field that takes the player's own keys itself (a web page's), with nothing composing pinyin here:
      // the page has the text already, so only the key lights up.
      if (field.playerTypes === false && !chinese) {
        if ('text' in event) flashLast(event.text)
        else if (event.key === 'escape') get().press({ kind: 'hide' })
        return
      }
      if ('text' in event) {
        flashLast(event.text)
        if (!chinese) {
          field.write(field.read() + event.text)
          return
        }
        for (const char of event.text) {
          const letter = pinyinKey(char)
          if (letter) compose(get().composing + letter)
          else {
            commitRaw()
            insert(char)
          }
        }
        tellHost()
        return
      }
      switch (event.key) {
        case 'backspace':
          if (chinese && get().composing) set({ composing: get().composing.slice(0, -1), page: 0 })
          else get().press({ kind: 'delete' })
          break
        case 'wordBackspace':
          if (chinese && get().composing) set({ composing: '', page: 0 })
          else field.write(withoutLastWord(field.read()))
          break
        case 'enter':
          // The composition goes in first (the first candidate of the page shown), then the key does what it
          // always does (search, go there, finish).
          if (chinese && get().composing) choose(get().page * CANDIDATES_PER_PAGE)
          get().press({ kind: 'return' })
          break
        case 'escape':
          if (chinese && get().composing) set({ composing: '' })
          else get().press({ kind: 'hide' })
          break
      }
      tellHost()
    },
    choose,
  }
})
