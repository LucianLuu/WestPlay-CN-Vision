import { describe, expect, it, vi } from 'vitest'
import {
  CANDIDATES_PER_PAGE,
  candidatesFor,
  digitChoice,
  loadTable,
  pick,
  pinyinKey,
  rawText,
  syllablesIn,
  syllablesShown,
  TABLE_URL,
  type Table,
} from './pinyin'

/** A stand-in for the generated table (`ui/public/chinese/pinyin.json`): the same shapes, a few keys. */
const table: Table = {
  chars: {
    ni: '你呢尼',
    hao: '好号',
    xi: '西',
    an: '安',
    xian: '先线',
    shi: '是事',
    hui: '会回',
    o: '哦',
  },
  words: {
    nihao: ['你好'],
    xian: ['西安'],
    shihui: ['实惠'],
    // Its syllables aren't in `chars` (as a word whose characters' readings the table has by other keys): the
    // word is still offered for its own pinyin.
    beijing: ['北京'],
  },
}

describe('the syllables a buffer spells', () => {
  it('reads them greedily, longest first', () => {
    expect(syllablesIn('nihao', table)).toEqual({ done: ['ni', 'hao'], rest: '' })
    // The last syllable unfinished: the letters that aren't one yet are left over.
    expect(syllablesIn('nih', table)).toEqual({ done: ['ni'], rest: 'h' })
    expect(syllablesIn('n', table)).toEqual({ done: [], rest: 'n' })
    // Nothing typed.
    expect(syllablesIn('', table)).toEqual({ done: [], rest: '' })
  })

  it('reads the apostrophe as a syllable boundary of its own', () => {
    expect(syllablesIn("xi'an", table)).toEqual({ done: ['xi', 'an'], rest: '' })
    // Without it, "xian" is one syllable (the greedy reading).
    expect(syllablesIn('xian', table)).toEqual({ done: ['xian'], rest: '' })
  })

  it('shows what was typed syllable by syllable', () => {
    expect(syllablesShown('nihao', table)).toBe('ni hao')
    expect(syllablesShown('nih', table)).toBe('ni h')
    expect(syllablesShown('', table)).toBe('')
  })
})

describe('what a buffer offers', () => {
  it('offers a word for a buffer that reads as more than one syllable, before its characters', () => {
    expect(candidatesFor('nihao', table)).toEqual(['你好', '你', '呢', '尼'])
    // The second syllable's characters aren't offered yet: picking one of the first leaves them to pick from.
    expect(candidatesFor('shihui', table)).toEqual(['实惠', '是', '事'])
    expect(candidatesFor('hui', table)).toEqual(['会', '回'])
  })

  it('offers a one-syllable buffer its characters first, its word after', () => {
    // "xian" is 先's syllable at least as often as it is 西安's pinyin; xi'an is how 西安 is asked for.
    expect(candidatesFor('xian', table)).toEqual(['先', '线', '西安'])
    // With the boundary typed, the word comes first — its key is the letters without it.
    expect(candidatesFor("xi'an", table)).toEqual(['西安', '西'])
  })

  it('offers a word even when the syllables of its pinyin are keys the table itself has none of', () => {
    expect(candidatesFor('beijing', table)).toEqual(['北京'])
  })

  it('offers nothing for nothing, and everything a buffer has (the bar pages through it)', () => {
    expect(candidatesFor('', table)).toEqual([])
    expect(candidatesFor('zzz', table)).toEqual([])
    // No slicing here: the bar shows CANDIDATES_PER_PAGE at a time, and the paging keys take the rest.
    const many: Table = { chars: { a: '一二三四五六七八九十' }, words: {} }
    expect(candidatesFor('a', many)).toHaveLength(10)
    expect(candidatesFor('a', many).length).toBeGreaterThan(CANDIDATES_PER_PAGE)
  })
})

describe('picking a candidate', () => {
  it('writes a word whole and leaves nothing', () => {
    expect(pick('nihao', 0, table)).toEqual({ text: '你好', buffer: '' })
    expect(pick('beijing', 0, table)).toEqual({ text: '北京', buffer: '' })
  })

  it('writes a character and leaves the syllables after it', () => {
    expect(pick('nihao', 1, table)).toEqual({ text: '你', buffer: 'hao' })
    // The syllable boundary the player typed is behind us too.
    expect(pick("xi'an", 1, table)).toEqual({ text: '西', buffer: 'an' })
    // A one-syllable pick takes all of it.
    expect(pick('xian', 0, table)).toEqual({ text: '先', buffer: '' })
    // A word offered after a one-syllable buffer's characters still takes the whole buffer.
    expect(pick('xian', 2, table)).toEqual({ text: '西安', buffer: '' })
  })

  it("has nothing for a candidate that isn't there", () => {
    expect(pick('nihao', 20, table)).toBeNull()
    expect(pick('nihao', -1, table)).toBeNull()
    expect(pick('zzz', 0, table)).toBeNull()
  })
})

describe('the keys the composition takes', () => {
  it('takes the letters and the apostrophe', () => {
    expect(pinyinKey('a')).toBe('a')
    expect(pinyinKey('N')).toBe('n')
    expect(pinyinKey("'")).toBe("'")
    // Not pinyin: a digit, a symbol, a letter of another alphabet (a Turkish ı, a Chinese character).
    expect(pinyinKey('1')).toBeNull()
    expect(pinyinKey('!')).toBeNull()
    expect(pinyinKey('ı')).toBeNull()
    expect(pinyinKey('中')).toBeNull()
  })

  it('maps a digit key to the candidate position it names', () => {
    // 1 to 9 name positions 0 to 8; the store only takes the ones the page actually holds (eight).
    expect(digitChoice('1')).toBe(0)
    expect(digitChoice('8')).toBe(7)
    expect(digitChoice('9')).toBe(8)
    expect(digitChoice('0')).toBeNull()
    expect(digitChoice('a')).toBeNull()
  })

  it('commits the letters as they stand, without the boundaries the player typed', () => {
    expect(rawText('abc')).toBe('abc')
    expect(rawText("xi'an")).toBe('xian')
  })
})

describe('the table', () => {
  it('is fetched once, from where the page serves it', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => table }))
    vi.stubGlobal('fetch', fetch)
    expect(await loadTable()).toEqual(table)
    expect(await loadTable()).toEqual(table)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(TABLE_URL)
    vi.unstubAllGlobals()
  })
})
