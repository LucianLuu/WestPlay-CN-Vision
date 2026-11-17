import { describe, expect, it } from 'vitest'
import { nextLanguage, otherLanguage } from './layouts'

describe('the globe key', () => {
  it('takes the Chinese input method and its neighbours round, English one press from Chinese', () => {
    expect(otherLanguage('zh', 'zh')).toBe('en')
    expect(otherLanguage('en', 'zh')).toBe('tr')
    expect(otherLanguage('tr', 'zh')).toBe('zh')
    // Three presses come back to where it started.
    expect(otherLanguage(otherLanguage(otherLanguage('en', 'zh'), 'zh'), 'zh')).toBe('en')
  })

  it('toggles every other language between its own keyboard and English', () => {
    expect(otherLanguage('de', 'de')).toBe('en')
    expect(otherLanguage('en', 'de')).toBe('de')
  })

  it('cycles the Chinese input method by nextLanguage', () => {
    expect(nextLanguage('zh')).toBe('en')
    expect(nextLanguage('en')).toBe('tr')
    expect(nextLanguage('tr')).toBe('zh')
  })
})
