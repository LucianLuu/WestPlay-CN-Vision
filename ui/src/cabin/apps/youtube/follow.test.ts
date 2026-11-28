import { describe, expect, it } from 'vitest'
import { follow, isEpisode, isSeason, LOAD_MS, sameVideo } from './follow'

describe('follow', () => {
  it('brings back the video YouTube plays after the page reloaded', () => {
    expect(follow(null, 'abc', null, 0)).toEqual({ shown: 'restore', loading: null })
    expect(follow('abc', 'abc', null, 0)).toEqual({ shown: 'keep', loading: null })
  })

  it('keeps a video asked for while YouTube still reports the one before', () => {
    const loading = { video: 'new', at: 1000 }
    expect(follow('new', 'old', loading, 2000)).toEqual({ shown: 'keep', loading })
    // Until it reports it,
    expect(follow('new', 'new', loading, 3000)).toEqual({ shown: 'keep', loading: null })
    // or takes too long: then what it plays is what's shown.
    expect(follow('new', 'old', loading, 1000 + LOAD_MS)).toEqual({ shown: 'restore', loading: null })
  })

  it('shows nothing playing when YouTube isn’t running, unless one is on its way', () => {
    expect(follow('abc', null, null, 0)).toEqual({ shown: 'clear', loading: null })
    expect(follow(null, null, null, 0)).toEqual({ shown: 'keep', loading: null })
    const loading = { video: 'abc', at: 0 }
    expect(follow('abc', null, loading, 500)).toEqual({ shown: 'keep', loading })
  })
})

describe('sameVideo', () => {
  it('takes the video itself', () => {
    expect(sameVideo({ video: 'BV1GJ411x7h7', at: 0 }, 'BV1GJ411x7h7')).toBe(true)
    expect(sameVideo({ video: 'BV1GJ411x7h7', at: 0 }, 'BV1xx411c7mD')).toBe(false)
  })

  it('takes a season and its own episode for one watch', () => {
    // Bilibili plays `ss47836` as `ep830494` and reports the episode (owner 2026-11-26: 番剧的视频无法加载).
    expect(sameVideo({ video: 'ss47836', at: 0 }, 'ep830494')).toBe(true)
    // Anything else a season's page may report.
    expect(sameVideo({ video: 'ss47836', at: 0 }, 'ss47836')).toBe(true)
  })

  it('keeps an episode’s own id apart from another season', () => {
    expect(sameVideo({ video: 'ep830494', at: 0 }, 'ss47836')).toBe(false)
    expect(sameVideo({ video: 'ep830494', at: 0 }, 'ep830494')).toBe(true)
    // Two seasons are two videos, and so are two videos' ids.
    expect(sameVideo({ video: 'ss47836', at: 0 }, 'ss1')).toBe(false)
  })

  it('takes the season of an episode asked for, once the app says which it is', () => {
    // 选集 asks for an episode; its page answers with the season it belongs to (`bilibili.js` `current()`,
    // which reports `ss…` for an `ep…` page that knows its season). Same watch, so no black screen over it.
    expect(sameVideo({ video: 'ep830494', at: 0, also: ['ss47836'] }, 'ss47836')).toBe(true)
    // Another season answering is another video: the page still has to go to this one.
    expect(sameVideo({ video: 'ep830494', at: 0, also: ['ss47836'] }, 'ss999')).toBe(false)
  })

  it('keeps two episodes of one season apart, so 选集 can move between them', () => {
    // The app asks for another episode of the season playing: not the same watch, and the page has to go
    // there (owner 2026-11-26: "选集还是有问题").
    expect(sameVideo({ video: 'ep828752', at: 0 }, 'ep826497')).toBe(false)
    expect(sameVideo({ video: 'ep828752', at: 0 }, 'ep828752')).toBe(true)
  })

  it('answers the season an episode belongs to, both ways round', () => {
    expect(isSeason('ss47836')).toBe(true)
    expect(isSeason('ep826497')).toBe(false)
    expect(isEpisode('ep826497')).toBe(true)
    expect(isEpisode('ss47836')).toBe(false)
    expect(isEpisode('BV1GJ411x7h7')).toBe(false)
  })
})
